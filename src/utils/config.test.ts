import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  getConfigPath,
  ensureConfigDir,
  loadConfig,
  saveConfig,
  loadAuth,
  saveAuth,
  getDefaultConfig,
} from './config.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

describe('config utils', () => {
  const projectRoot = '/fake/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConfigPath', () => {
    it('should return config directory path', async () => {
      const path = await getConfigPath(projectRoot);
      expect(path).toBe('/fake/project/.sprint-artifact');
    });
  });

  describe('ensureConfigDir', () => {
    it('should create dir if not exists', async () => {
      mockExistsSync.mockReturnValue(false);
      await ensureConfigDir(projectRoot);
      expect(mockMkdir).toHaveBeenCalledWith('/fake/project/.sprint-artifact', { recursive: true });
    });

    it('should skip creating dir if exists', async () => {
      mockExistsSync.mockReturnValue(true);
      await ensureConfigDir(projectRoot);
      expect(mockMkdir).not.toHaveBeenCalled();
    });
  });

  describe('loadConfig', () => {
    it('should return null if config file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await loadConfig(projectRoot);
      expect(result).toBeNull();
    });

    it('should parse and return config if file exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const configData = { version: 1, googleDrive: { folderId: 'abc', year: '2026' } };
      mockReadFile.mockResolvedValue(JSON.stringify(configData));
      const result = await loadConfig(projectRoot);
      expect(result).toEqual(configData);
    });

    it('should throw on invalid JSON', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue('not json');
      await expect(loadConfig(projectRoot)).rejects.toThrow();
    });
  });

  describe('saveConfig', () => {
    it('should ensure dir and write config', async () => {
      mockExistsSync.mockReturnValue(false);
      const config = { version: 1, googleDrive: { folderId: 'abc', year: '2026' } };
      await saveConfig(projectRoot, config);
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/fake/project/.sprint-artifact/config.json',
        JSON.stringify(config, null, 2),
        'utf-8',
      );
    });
  });

  describe('loadAuth', () => {
    it('should return null if auth file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await loadAuth(projectRoot);
      expect(result).toBeNull();
    });

    it('should parse and return auth if file exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const authData = { type: 'oauth2', credentials: { client_id: 'x', client_secret: 'y', redirect_uris: [] } };
      mockReadFile.mockResolvedValue(JSON.stringify(authData));
      const result = await loadAuth(projectRoot);
      expect(result).toEqual(authData);
    });
  });

  describe('saveAuth', () => {
    it('should ensure dir and write auth', async () => {
      mockExistsSync.mockReturnValue(false);
      const auth = { type: 'oauth2' as const, credentials: { client_id: 'x', client_secret: 'y', redirect_uris: [] } };
      await saveAuth(projectRoot, auth);
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/fake/project/.sprint-artifact/auth.json',
        JSON.stringify(auth, null, 2),
        'utf-8',
      );
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default config with current year', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15'));
      const config = getDefaultConfig();
      expect(config).toEqual({
        version: 1,
        googleDrive: {
          folderId: '',
          year: '2026',
        },
      });
      vi.useRealTimers();
    });
  });
});
