import { google, drive_v3 } from 'googleapis';
import type { AuthConfig, ManifestFile, OAuth2Credentials } from '../types/index.js';

export class GoogleDriveClient {
  private drive: drive_v3.Drive;

  constructor(auth: AuthConfig) {
    const authClient = this.createAuthClient(auth);
    this.drive = google.drive({ version: 'v3', auth: authClient });
  }

  private createAuthClient(auth: AuthConfig) {
    if (auth.type === 'service_account') {
      return new google.auth.GoogleAuth({
        credentials: auth.credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
    } else {
      const creds = auth.credentials as OAuth2Credentials;
      const oauth2Client = new google.auth.OAuth2(
        creds.client_id,
        creds.client_secret,
        creds.redirect_uris[0]
      );
      if (creds.refresh_token) {
        oauth2Client.setCredentials({
          refresh_token: creds.refresh_token,
          access_token: creds.access_token,
        });
      }
      return oauth2Client;
    }
  }

  async createFolder(name: string, parentId?: string): Promise<string> {
    const fileMetadata: drive_v3.Schema$File = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId && { parents: [parentId] }),
    };

    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      fields: 'id',
    });

    return response.data.id!;
  }

  async createFile(name: string, content: string, parentId?: string, mimeType = 'text/markdown'): Promise<string> {
    const fileMetadata: drive_v3.Schema$File = {
      name,
      ...(parentId && { parents: [parentId] }),
    };

    const media = {
      mimeType,
      body: content,
    };

    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id',
    });

    return response.data.id!;
  }

  async getFile(fileId: string): Promise<string> {
    const response = await this.drive.files.get({
      fileId,
      alt: 'media',
    });
    return response.data as string;
  }

  async updateFile(fileId: string, content: string, mimeType = 'text/markdown'): Promise<void> {
    await this.drive.files.update({
      fileId,
      media: {
        mimeType,
        body: content,
      },
    });
  }

  async listFiles(folderId: string): Promise<ManifestFile[]> {
    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime, md5Checksum)',
      pageSize: 1000,
    });

    return (response.data.files || []).map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      modifiedTime: file.modifiedTime!,
      md5Checksum: file.md5Checksum || undefined,
    }));
  }

  async getFileMetadata(fileId: string): Promise<ManifestFile> {
    const response = await this.drive.files.get({
      fileId,
      fields: 'id, name, mimeType, modifiedTime, md5Checksum',
    });

    const file = response.data;
    return {
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      modifiedTime: file.modifiedTime!,
      md5Checksum: file.md5Checksum || undefined,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
  }

  async findFolder(name: string, parentId?: string): Promise<string | null> {
    const query = parentId
      ? `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      : `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

    const response = await this.drive.files.list({
      q: query,
      fields: 'files(id)',
      pageSize: 1,
    });

    return response.data.files?.[0]?.id || null;
  }
}
