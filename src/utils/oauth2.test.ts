import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({ existsSync: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn() }));
vi.mock('open', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const mockCreateServer = vi.hoisted(() => vi.fn());
vi.mock('node:http', () => ({ createServer: mockCreateServer }));

import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { findCredentials, saveCredentialsGlobal, login } from './oauth2.js';

describe('findCredentials', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should find from global config', async () => {
    vi.mocked(existsSync).mockImplementation((p) => p.toString().includes('credentials.json'));
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ installed: { client_id: 'gid', client_secret: 'gsec' } }));
    expect(await findCredentials()).toEqual({ clientId: 'gid', clientSecret: 'gsec' });
  });

  it('should try web key', async () => {
    vi.mocked(existsSync).mockImplementation((p) => p.toString().includes('credentials.json'));
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ web: { client_id: 'wid', client_secret: 'wsec' } }));
    expect(await findCredentials()).toEqual({ clientId: 'wid', clientSecret: 'wsec' });
  });

  it('should fallback to local paths', async () => {
    let call = 0;
    vi.mocked(existsSync).mockImplementation(() => { call++; return call === 2; });
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ installed: { client_id: 'lid', client_secret: 'lsec' } }));
    expect(await findCredentials()).toEqual({ clientId: 'lid', clientSecret: 'lsec' });
  });

  it('should return null if not found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(await findCredentials()).toBeNull();
  });

  it('should return null if no client fields', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ installed: {} }));
    expect(await findCredentials()).toBeNull();
  });

  it('should handle JSON parse error', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue('bad json');
    expect(await findCredentials()).toBeNull();
  });
});

describe('saveCredentialsGlobal', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should create dir and save', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFile).mockResolvedValue('{}');
    await saveCredentialsGlobal('/p/creds.json');
    expect(mkdir).toHaveBeenCalledOnce();
  });

  it('should skip mkdir if exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue('{}');
    await saveCredentialsGlobal('/p/creds.json');
    expect(mkdir).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  let serverMock: any;

  let origStdin: typeof process.stdin;

  beforeEach(() => {
    vi.clearAllMocks();
    origStdin = process.stdin;

    serverMock = {
      listen: vi.fn((_port: any, cb: () => void) => { serverMock._addr = { port: 34567 }; cb(); }),
      address: vi.fn(() => serverMock._addr),
      close: vi.fn(),
      on: vi.fn(),
    };
    mockCreateServer.mockImplementation((handler: any) => { serverMock._requestHandler = handler; return serverMock; });

    const stdinMock = { setEncoding: vi.fn(), resume: vi.fn(), on: vi.fn() };
    Object.defineProperty(process, 'stdin', { value: stdinMock, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: origStdin, writable: true });
  });

  it('should resolve with credentials from credentialsPath', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ installed: { client_id: 'pid', client_secret: 'psec' } }));

    const loginPromise = login({ credentialsPath: '/c.json' });
    await new Promise(r => setTimeout(r, 0));

    const handler = mockCreateServer.mock.calls[0]?.[0];
    expect(handler).toBeDefined();

    const res = { writeHead: vi.fn(), end: vi.fn() };
    const fetchMock = vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }) });
    vi.stubGlobal('fetch', fetchMock);

    handler({ url: '/?code=auth-code' }, res);
    const creds = await loginPromise;
    expect(creds.client_id).toBe('pid');
    expect(creds.access_token).toBe('at');
    vi.unstubAllGlobals();
  });

  it('should throw when no credentials found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFile).mockRejectedValue(new Error('not found'));
    await expect(login({})).rejects.toThrow('No credentials found');
  });

  it('should reject on OAuth error in callback', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ installed: { client_id: 'id', client_secret: 'sec' } }));

    const loginPromise = login({ credentialsPath: '/c.json' });
    await new Promise(r => setTimeout(r, 0));

    const handler = mockCreateServer.mock.calls[0]?.[0];
    const res = { writeHead: vi.fn(), end: vi.fn() };
    handler({ url: '/?error=access_denied' }, res);
    await expect(loginPromise).rejects.toThrow('OAuth error: access_denied');
  });

  it('should reject on no code in callback', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ installed: { client_id: 'id', client_secret: 'sec' } }));

    const loginPromise = login({ credentialsPath: '/c.json' });
    await new Promise(r => setTimeout(r, 0));

    const handler = mockCreateServer.mock.calls[0]?.[0];
    const res = { writeHead: vi.fn(), end: vi.fn() };
    handler({ url: '/?some=param' }, res);
    await expect(loginPromise).rejects.toThrow('No authorization code received');
  });

  it('should reject on server error event', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ installed: { client_id: 'id', client_secret: 'sec' } }));
    serverMock.on.mockImplementation((event: string, cb: any) => { if (event === 'error') cb(new Error('Server error')); });

    const loginPromise = login({ credentialsPath: '/c.json' });
    loginPromise.catch(() => {}); // prevent unhandled rejection (async wrapper rejects during microtask flush)
    await new Promise(r => setTimeout(r, 0));
    await expect(loginPromise).rejects.toThrow('Server error');
  });
});
