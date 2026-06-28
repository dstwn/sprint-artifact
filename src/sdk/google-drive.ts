import { execSync } from 'node:child_process';
import type { AuthConfig, ManifestFile, OAuth2Credentials } from '../types/index.js';

export class GoogleDriveClient {
  private accessToken: string;
  private refreshToken: string;
  private clientId: string;
  private clientSecret: string;
  private authConfig: AuthConfig;

  constructor(auth: AuthConfig) {
    this.authConfig = auth;
    if (auth.type === 'oauth2') {
      const creds = auth.credentials as OAuth2Credentials;
      this.accessToken = creds.access_token || '';
      this.refreshToken = creds.refresh_token || '';
      this.clientId = creds.client_id;
      this.clientSecret = creds.client_secret;
    } else {
      this.accessToken = '';
      this.refreshToken = '';
      this.clientId = '';
      this.clientSecret = '';
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available. Please login again.');
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const data = await res.json() as any;
      
      if (data.error) {
        throw new Error(`Refresh failed: ${data.error}`);
      }

      this.accessToken = data.access_token;
    } catch {
      // Fallback to curl
      const result = execSync(
        `curl -s -X POST "https://oauth2.googleapis.com/token" -d "${body.toString()}"`,
        { encoding: 'utf-8' }
      );
      const data = JSON.parse(result);
      
      if (data.error) {
        throw new Error(`Refresh failed: ${data.error}`);
      }

      this.accessToken = data.access_token;
    }
  }

  private async request(method: string, url: string, body?: any, retry = true): Promise<any> {
    try {
      const headers = {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      };

      const options: RequestInit = {
        method,
        headers,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const res = await fetch(url, options);
      
      // If 401, refresh token and retry
      if (res.status === 401 && retry) {
        await this.refreshAccessToken();
        return this.request(method, url, body, false);
      }

      return await res.json();
    } catch {
      // Fallback to curl
      const curlCmd = `curl -s -X ${method} "${url}" -H "Authorization: Bearer ${this.accessToken}" -H "Content-Type: application/json"`;
      const result = execSync(body ? `${curlCmd} -d '${JSON.stringify(body)}'` : curlCmd, { encoding: 'utf-8' });
      const data = JSON.parse(result);
      
      // If 401, refresh token and retry
      if (data.error?.code === 401 && retry) {
        await this.refreshAccessToken();
        return this.request(method, url, body, false);
      }

      return data;
    }
  }

  async listFiles(folderId: string): Promise<ManifestFile[]> {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id, name, mimeType, modifiedTime, md5Checksum)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    
    const data = await this.request('GET', url);
    
    return (data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      md5Checksum: file.md5Checksum || undefined,
    }));
  }

  async createFolder(name: string, parentId?: string): Promise<string> {
    const body: any = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) {
      body.parents = [parentId];
    }

    const data = await this.request('POST', 'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', body);
    return data.id;
  }

  async createFile(name: string, content: string, parentId?: string, mimeType = 'text/markdown'): Promise<string> {
    const metadata: any = { name };
    if (parentId) {
      metadata.parents = [parentId];
    }

    // Use multipart upload
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n');

    try {
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });
      const data = await res.json() as any;
      return data.id;
    } catch {
      const result = execSync(
        `curl -s -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true" -H "Authorization: Bearer ${this.accessToken}" -H "Content-Type: multipart/related; boundary=${boundary}" -d '${multipartBody.replace(/'/g, "\\'")}'`,
        { encoding: 'utf-8' }
      );
      return JSON.parse(result).id;
    }
  }

  async getFile(fileId: string): Promise<string> {
    const data = await this.request('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  async updateFile(fileId: string, content: string, mimeType = 'text/markdown'): Promise<void> {
    try {
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': mimeType,
        },
        body: content,
      });
    } catch {
      execSync(
        `curl -s -X PATCH "https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media" -H "Authorization: Bearer ${this.accessToken}" -H "Content-Type: ${mimeType}" -d '${content.replace(/'/g, "\\'")}'`,
        { encoding: 'utf-8' }
      );
    }
  }

  async getFileMetadata(fileId: string): Promise<ManifestFile> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id, name, mimeType, modifiedTime, md5Checksum`;
    const file = await this.request('GET', url);
    
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      md5Checksum: file.md5Checksum || undefined,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request('DELETE', `https://www.googleapis.com/drive/v3/files/${fileId}`);
  }

  async findFolder(name: string, parentId?: string): Promise<string | null> {
    const query = parentId
      ? `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      : `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const data = await this.request('GET', url);

    return data.files?.[0]?.id || null;
  }

  async getFileParents(fileId: string): Promise<string[]> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`;
    const data = await this.request('GET', url);
    return data.parents || [];
  }

  async moveFile(fileId: string, newParentId: string): Promise<void> {
    const oldParents = await this.getFileParents(fileId);
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?removeParents=${oldParents.join(',')}&addParents=${newParentId}&supportsAllDrives=true`;
    await this.request('PATCH', url);
  }
}
