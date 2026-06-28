import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execSync: mockExecSync }));

import { GoogleDriveClient } from './google-drive.js';
import type { AuthConfig, OAuth2Credentials } from '../types/index.js';

function makeOAuth2(overrides: Partial<OAuth2Credentials> = {}): AuthConfig {
  return {
    type: 'oauth2',
    credentials: { client_id: 'cid', client_secret: 'csec', redirect_uris: ['http://l'], refresh_token: 'rt', access_token: 'at', token_expiry: new Date(Date.now() + 1e6).toISOString(), ...overrides },
  };
}
function makeSA(): AuthConfig {
  return { type: 'service_account', credentials: { type: 'service_account', project_id: 'p', private_key_id: 'k', private_key: 'k', client_email: 'sa@p.com', client_id: '1', auth_uri: 'a', token_uri: 't', auth_provider_x509_cert_url: 'x', client_x509_cert_url: 'x' } };
}
function jsonOk(data: any) { return { status: 200, ok: true, json: vi.fn().mockResolvedValue(data), text: vi.fn().mockResolvedValue('') }; }
function jsonStatus(status: number, data: any) { return { status, ok: status < 300, json: vi.fn().mockResolvedValue(data), text: vi.fn().mockResolvedValue(JSON.stringify(data)) }; }
function textOk(t: string) { return { status: 200, ok: true, text: vi.fn().mockResolvedValue(t), json: vi.fn() }; }

describe('GoogleDriveClient', () => {
  let client: GoogleDriveClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecSync.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new GoogleDriveClient(makeOAuth2());
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  describe('constructor', () => {
    it('should handle oauth2', () => expect(new GoogleDriveClient(makeOAuth2())).toBeInstanceOf(GoogleDriveClient));
    it('should handle service_account', () => expect(new GoogleDriveClient(makeSA())).toBeInstanceOf(GoogleDriveClient));
    it('should handle oauth2 without tokens', () => expect(new GoogleDriveClient(makeOAuth2({ access_token: undefined, refresh_token: undefined }))).toBeInstanceOf(GoogleDriveClient));
  });

  describe('refreshAccessToken', () => {
    it('should throw if no refresh token', async () => {
      const c = new GoogleDriveClient(makeOAuth2({ refresh_token: undefined }));
      await expect((c as any).refreshAccessToken()).rejects.toThrow('No refresh token');
    });

    it('should refresh via fetch', async () => {
      fetchMock.mockResolvedValue(jsonOk({ access_token: 'new-at' }));
      await (client as any).refreshAccessToken();
      expect(fetchMock).toHaveBeenCalledWith('https://oauth2.googleapis.com/token', expect.objectContaining({ method: 'POST' }));
    });

    it('should fallback to curl on fetch error', async () => {
      fetchMock.mockRejectedValue(new Error('fail'));
      mockExecSync.mockReturnValue(JSON.stringify({ access_token: 'curl-at' }));
      await (client as any).refreshAccessToken();
      expect(mockExecSync).toHaveBeenCalled();
    });

    it('should throw on error from fetch + curl fallback', async () => {
      fetchMock.mockResolvedValue(jsonOk({ error: 'invalid_grant' }));
      mockExecSync.mockReturnValue(JSON.stringify({ error: 'invalid_client' }));
      await expect((client as any).refreshAccessToken()).rejects.toThrow('Refresh failed: invalid_client');
    });

    it('should throw on error from curl fallback', async () => {
      fetchMock.mockRejectedValue(new Error('fail'));
      mockExecSync.mockReturnValue(JSON.stringify({ error: 'invalid_client' }));
      await expect((client as any).refreshAccessToken()).rejects.toThrow('Refresh failed: invalid_client');
    });
  });

  describe('request', () => {
    it('should make GET request via fetch', async () => {
      fetchMock.mockResolvedValue(jsonOk({ files: [] }));
      expect(await (client as any).request('GET', 'https://ex.com/api')).toEqual({ files: [] });
    });

    it('should include body in POST', async () => {
      fetchMock.mockResolvedValue(jsonOk({ id: '1' }));
      await (client as any).request('POST', 'https://ex.com/api', { name: 't' });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: 't' });
    });

    it('should retry on 401 and succeed', async () => {
      fetchMock.mockResolvedValueOnce(jsonStatus(401, {}));
      fetchMock.mockResolvedValueOnce(jsonOk({ access_token: 'new-at' }));
      fetchMock.mockResolvedValueOnce(jsonOk({ files: [] }));
      expect(await (client as any).request('GET', 'https://ex.com/api')).toEqual({ files: [] });
    });

    it('should not retry on second 401', async () => {
      fetchMock.mockResolvedValue(jsonStatus(401, {}));
      expect(await (client as any).request('GET', 'https://ex.com/api', undefined, false)).toEqual({});
    });

    it('should fallback to curl on fetch error', async () => {
      fetchMock.mockRejectedValue(new Error('fail'));
      mockExecSync.mockReturnValue(JSON.stringify({ files: [{ id: 'f1' }] }));
      expect(await (client as any).request('GET', 'https://ex.com/api')).toEqual({ files: [{ id: 'f1' }] });
    });

    it('should retry on curl 401', async () => {
      fetchMock.mockRejectedValue(new Error('fail'));
      mockExecSync.mockReturnValueOnce(JSON.stringify({ error: { code: 401 } }));
      mockExecSync.mockReturnValueOnce(JSON.stringify({ access_token: 'new' }));
      mockExecSync.mockReturnValueOnce(JSON.stringify({ files: [{ id: 'f1' }] }));
      expect(await (client as any).request('GET', 'https://ex.com/api')).toEqual({ files: [{ id: 'f1' }] });
    });
  });

  describe('listFiles', () => {
    it('should return mapped files', async () => {
      fetchMock.mockResolvedValue(jsonOk({ files: [{ id: 'f1', name: 'd.md', mimeType: 'text/markdown', modifiedTime: '2026-01-01T00:00:00Z', md5Checksum: 'abc' }] }));
      const files = await client.listFiles('fid');
      expect(files[0].id).toBe('f1');
      expect(files[0].md5Checksum).toBe('abc');
    });
    it('should return empty array', async () => {
      fetchMock.mockResolvedValue(jsonOk({}));
      expect(await client.listFiles('fid')).toEqual([]);
    });
  });

  describe('createFolder', () => {
    it('should create with parent', async () => {
      fetchMock.mockResolvedValue(jsonOk({ id: 'nf' }));
      expect(await client.createFolder('F', 'p')).toBe('nf');
    });
    it('should create without parent', async () => {
      fetchMock.mockResolvedValue(jsonOk({ id: 'nf' }));
      expect(await client.createFolder('F')).toBe('nf');
    });
  });

  describe('createFile', () => {
    it('should create file', async () => {
      fetchMock.mockResolvedValue({ status: 200, ok: true, json: vi.fn().mockResolvedValue({ id: 'f1' }), text: vi.fn().mockResolvedValue('') });
      expect(await client.createFile('t.md', 'hi', 'p')).toBe('f1');
    });
    it('should create without parent', async () => {
      fetchMock.mockResolvedValue({ status: 200, ok: true, json: vi.fn().mockResolvedValue({ id: 'f2' }), text: vi.fn().mockResolvedValue('') });
      expect(await client.createFile('t.md', 'hi')).toBe('f2');
    });
    it('should throw on API error with curl fallback', async () => {
      fetchMock.mockResolvedValue({ status: 400, ok: false, json: vi.fn().mockResolvedValue({}), text: vi.fn().mockResolvedValue('Bad') });
      mockExecSync.mockReturnValue(JSON.stringify({ error: { message: 'Bad from curl' } }));
      await expect(client.createFile('t.md', 'c', 'p')).rejects.toThrow('Failed to create file: Bad from curl');
    });
    it('should throw if no ID from curl fallback', async () => {
      fetchMock.mockResolvedValue({ status: 200, ok: true, json: vi.fn().mockResolvedValue({}), text: vi.fn().mockResolvedValue('') });
      mockExecSync.mockReturnValue(JSON.stringify({}));
      await expect(client.createFile('t.md', 'c', 'p')).rejects.toThrow('Failed to create file');
    });
    it('should fallback to curl', async () => {
      fetchMock.mockRejectedValue(new Error('fail'));
      mockExecSync.mockReturnValue(JSON.stringify({ id: 'fc' }));
      expect(await client.createFile('t.md', 'c', 'p')).toBe('fc');
    });
    it('should throw on curl error', async () => {
      fetchMock.mockRejectedValue(new Error('fail'));
      mockExecSync.mockReturnValue(JSON.stringify({ error: { message: 'q' } }));
      await expect(client.createFile('t.md', 'c', 'p')).rejects.toThrow('Failed to create file');
    });
  });

  describe('updateFile', () => {
    it('should PATCH file', async () => {
      fetchMock.mockResolvedValue({ status: 200, ok: true, json: vi.fn(), text: vi.fn() });
      await expect(client.updateFile('f1', 'c')).resolves.toBeUndefined();
    });
    it('should retry on 401', async () => {
      fetchMock.mockResolvedValueOnce({ status: 401, ok: false, json: vi.fn(), text: vi.fn() });
      fetchMock.mockResolvedValueOnce(jsonOk({ access_token: 'new' }));
      fetchMock.mockResolvedValueOnce({ status: 200, ok: true, json: vi.fn(), text: vi.fn() });
      await expect(client.updateFile('f1', 'c')).resolves.toBeUndefined();
    });
    it('should fallback to curl on error (error is caught)', async () => {
      fetchMock.mockResolvedValue({ status: 500, ok: false, json: vi.fn(), text: vi.fn().mockResolvedValue('ISE') });
      mockExecSync.mockReturnValue('');
      await expect(client.updateFile('f1', 'c')).resolves.toBeUndefined();
    });
    it('should fallback to curl', async () => {
      fetchMock.mockRejectedValue(new Error('fail'));
      mockExecSync.mockReturnValue('');
      await expect(client.updateFile('f1', 'c')).resolves.toBeUndefined();
    });
  });

  describe('getFile', () => {
    it('should download', async () => {
      fetchMock.mockResolvedValue(textOk('content'));
      expect(await client.getFile('f1')).toBe('content');
    });
    it('should retry on 401', async () => {
      fetchMock.mockResolvedValueOnce({ status: 401, text: vi.fn() });
      fetchMock.mockResolvedValueOnce(jsonOk({ access_token: 'new' }));
      fetchMock.mockResolvedValueOnce(textOk('retried'));
      expect(await client.getFile('f1')).toBe('retried');
    });
    it('should fallback to curl', async () => {
      fetchMock.mockRejectedValue(new Error('fail'));
      mockExecSync.mockReturnValue('curl-content');
      expect(await client.getFile('f1')).toBe('curl-content');
    });
  });

  describe('getFileMetadata', () => {
    it('should return metadata', async () => {
      fetchMock.mockResolvedValue(jsonOk({ id: 'f1', name: 'd.md', mimeType: 't', modifiedTime: '2026-01-01T00:00:00Z', md5Checksum: 'abc' }));
      expect((await client.getFileMetadata('f1')).md5Checksum).toBe('abc');
    });
    it('should handle missing md5', async () => {
      fetchMock.mockResolvedValue(jsonOk({ id: 'f1', name: 'd.md', mimeType: 't', modifiedTime: '2026-01-01T00:00:00Z' }));
      expect((await client.getFileMetadata('f1')).md5Checksum).toBeUndefined();
    });
  });

  describe('deleteFile', () => {
    it('should DELETE', async () => {
      fetchMock.mockResolvedValue(jsonOk({}));
      await expect(client.deleteFile('f1')).resolves.toBeUndefined();
    });
  });

  describe('findFolder', () => {
    it('should find with parent', async () => {
      fetchMock.mockResolvedValue(jsonOk({ files: [{ id: 'fid' }] }));
      expect(await client.findFolder('B', 'p')).toBe('fid');
    });
    it('should find without parent', async () => {
      fetchMock.mockResolvedValue(jsonOk({ files: [{ id: 'fid' }] }));
      expect(await client.findFolder('B')).toBe('fid');
    });
    it('should return null', async () => {
      fetchMock.mockResolvedValue(jsonOk({}));
      expect(await client.findFolder('X', 'p')).toBeNull();
    });
  });

  describe('getFileParents', () => {
    it('should return parents', async () => {
      fetchMock.mockResolvedValue(jsonOk({ parents: ['p1'] }));
      expect(await client.getFileParents('f1')).toEqual(['p1']);
    });
    it('should return empty', async () => {
      fetchMock.mockResolvedValue(jsonOk({}));
      expect(await client.getFileParents('f1')).toEqual([]);
    });
  });

  describe('moveFile', () => {
    it('should move file', async () => {
      fetchMock.mockResolvedValueOnce(jsonOk({ parents: ['old'] }));
      fetchMock.mockResolvedValueOnce(jsonOk({}));
      await expect(client.moveFile('f1', 'np')).resolves.toBeUndefined();
    });
  });
});
