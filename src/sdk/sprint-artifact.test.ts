import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  renameSync: vi.fn(),
  statSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:fs', () => fsMock);

vi.mock('../utils/config.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  loadAuth: vi.fn(),
  getDefaultConfig: vi.fn(() => ({
    version: 1,
    googleDrive: { folderId: '', year: '2026' },
  })),
}));

const mockDriveClientInstance = vi.hoisted(() => ({
  createFolder: vi.fn(),
  createFile: vi.fn(),
  listFiles: vi.fn(),
  getFile: vi.fn(),
  moveFile: vi.fn(),
  getFileParents: vi.fn(),
}));

vi.mock('./google-drive.js', () => ({
  GoogleDriveClient: vi.fn(() => mockDriveClientInstance),
}));

import { loadConfig, saveConfig, loadAuth } from '../utils/config.js';
import { GoogleDriveClient } from './google-drive.js';
import { SprintArtifact } from './sprint-artifact.js';

const mockSaveConfig = vi.mocked(saveConfig);
const mockLoadConfig = vi.mocked(loadConfig);
const mockLoadAuth = vi.mocked(loadAuth);

describe('SprintArtifact', () => {
  let artifact: SprintArtifact;
  const projectRoot = '/fake/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:00:00Z'));

    mockLoadAuth.mockResolvedValue({ type: 'oauth2', credentials: { client_id: 'x', client_secret: 'y', redirect_uris: [] } });
    mockLoadConfig.mockResolvedValue({
      version: 1,
      googleDrive: { folderId: 'root', year: '2026', defaultFolderId: 'default-folder' },
      selectedTask: 'IDS-001 Test task',
      selectedTaskId: 'task-folder-id',
      selectedTaskFolderId: 'parent-folder',
      selectedTaskType: 'backlogs',
    });
    mockSaveConfig.mockResolvedValue(undefined);

    artifact = new SprintArtifact(projectRoot);
  });

  afterEach(() => { vi.useRealTimers(); });

  describe('constructor', () => {
    it('should set projectRoot', () => {
      expect((artifact as any).projectRoot).toBe(projectRoot);
    });

    it('should initialize with null state', () => {
      expect((artifact as any).config).toBeNull();
      expect((artifact as any).auth).toBeNull();
      expect((artifact as any).driveClient).toBeNull();
    });
  });

  describe('init', () => {
    it('should save config with provided folderId and year', async () => {
      await artifact.init('root-folder', '2026', 'default-folder');
      expect(mockSaveConfig).toHaveBeenCalledWith(projectRoot, expect.objectContaining({
        version: 1,
        googleDrive: expect.objectContaining({ folderId: 'root-folder', year: '2026', defaultFolderId: 'default-folder' }),
      }));
    });

    it('should use current year if not provided', async () => {
      await artifact.init('root-folder');
      expect(mockSaveConfig).toHaveBeenCalledWith(projectRoot, expect.objectContaining({
        googleDrive: expect.objectContaining({ year: '2026' }),
      }));
    });
  });

  describe('ensureInitialized', () => {
    it('should load config and auth', async () => {
      await (artifact as any).ensureInitialized();
      expect(mockLoadConfig).toHaveBeenCalled();
      expect(mockLoadAuth).toHaveBeenCalled();
    });

    it('should throw if no config', async () => {
      mockLoadConfig.mockResolvedValue(null);
      await expect((artifact as any).ensureInitialized()).rejects.toThrow('Project not initialized');
    });

    it('should throw if no auth', async () => {
      mockLoadAuth.mockResolvedValue(null);
      await expect((artifact as any).ensureInitialized()).rejects.toThrow('Authentication not configured');
    });

    it('should skip reload if already set', async () => {
      (artifact as any).config = { version: 1, googleDrive: { folderId: 'x', year: '2026' } };
      (artifact as any).auth = { type: 'oauth2', credentials: { client_id: 'x', client_secret: 'y', redirect_uris: [] } };
      (artifact as any).driveClient = {} as any;
      await (artifact as any).ensureInitialized();
      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(mockLoadAuth).not.toHaveBeenCalled();
    });
  });

  describe('createBacklog', () => {
    beforeEach(async () => {
      mockDriveClientInstance.createFolder.mockResolvedValue('new-task-folder');
      mockDriveClientInstance.listFiles.mockResolvedValue([]);
      mockDriveClientInstance.getFile.mockResolvedValue('# doc');
      fsMock.existsSync.mockReturnValue(true);
      await (artifact as any).ensureInitialized();
    });

    it('should create 5 subfolders', async () => {
      await artifact.createBacklog('IDS-001', 'Fix bug', 'parent-folder');
      expect(mockDriveClientInstance.createFolder).toHaveBeenCalledWith('IDS-001 Fix bug', 'parent-folder');
      expect(mockDriveClientInstance.createFolder).toHaveBeenCalledWith('01. Business Requirement Documents', 'new-task-folder');
      expect(mockDriveClientInstance.createFolder).toHaveBeenCalledWith('05. Guide Documents', 'new-task-folder');
    });

    it('should set selectedTask config', async () => {
      await artifact.createBacklog('IDS-001', 'Fix bug', 'parent-folder');
      const config = mockSaveConfig.mock.calls.at(-1)[1];
      expect(config.selectedTask).toBe('IDS-001 Fix bug');
      expect(config.selectedTaskType).toBe('backlogs');
    });
  });

  describe('sync', () => {
    beforeEach(async () => { await (artifact as any).ensureInitialized(); });

    it('should throw if no active task', async () => {
      (artifact as any).config.selectedTaskId = undefined;
      await expect(artifact.sync()).rejects.toThrow('No active task');
    });

    it('should sync files', async () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue([]);
      mockDriveClientInstance.listFiles.mockResolvedValue([]);
      const result = await artifact.sync();
      expect(result).toHaveProperty('added');
    });
  });

  describe('uploadLocalFiles', () => {
    it('should upload files and recurse directories', async () => {
      fsMock.readdirSync.mockReturnValue(['sub', 'f.md']);
      const dirStat = { isDirectory: () => true, isFile: () => false };
      const fileStat = { isDirectory: () => false, isFile: () => true };
      fsMock.statSync.mockImplementation((path: string) => path.includes('sub') ? dirStat : fileStat);
      fsMock.readFileSync.mockReturnValue('content');
      mockDriveClientInstance.listFiles.mockResolvedValue([]);
      mockDriveClientInstance.createFolder.mockResolvedValue('sub-id');
      mockDriveClientInstance.createFile.mockResolvedValue('new-fid');

      const onUpload = vi.fn();
      await (artifact as any).uploadLocalFiles('/base', 'parent-id', onUpload);
      expect(mockDriveClientInstance.createFile).toHaveBeenCalled();
      expect(onUpload).toHaveBeenCalled();
    });
  });

  describe('getAllFilesRecursive', () => {
    it('should return non-folder files recursively', async () => {
      mockDriveClientInstance.listFiles
        .mockResolvedValueOnce([
          { id: 'f1', name: 'folder1', mimeType: 'application/vnd.google-apps.folder' },
          { id: 'f2', name: 'doc.md', mimeType: 'text/markdown' },
        ])
        .mockResolvedValueOnce([
          { id: 'f3', name: 'nested.md', mimeType: 'text/markdown' },
        ]);
      const files = await (artifact as any).getAllFilesRecursive('root');
      expect(files).toHaveLength(2);
    });
  });

  describe('moveToSprint', () => {
    beforeEach(async () => { await (artifact as any).ensureInitialized(); });

    it('should move file and local folder', async () => {
      mockDriveClientInstance.moveFile.mockResolvedValue(undefined);
      mockDriveClientInstance.listFiles.mockResolvedValue([]);
      fsMock.existsSync.mockReturnValue(true);
      await artifact.moveToSprint('tf', 'np', 'Task');
      expect(mockDriveClientInstance.moveFile).toHaveBeenCalledWith('tf', 'np');
      expect(fsMock.renameSync).toHaveBeenCalled();
    });

    it('should update config for selected task', async () => {
      mockDriveClientInstance.moveFile.mockResolvedValue(undefined);
      mockDriveClientInstance.listFiles.mockResolvedValue([]);
      fsMock.existsSync.mockReturnValue(true);
      (artifact as any).config.selectedTaskId = 'tf';
      await artifact.moveToSprint('tf', 'np', 'Task');
      expect((artifact as any).config.selectedTaskType).toBe('sprints');
    });
  });

  describe('pullFolder', () => {
    it('should download files and recurse subfolders', async () => {
      mockDriveClientInstance.listFiles.mockResolvedValue([
        { id: 'f1', name: 'sub', mimeType: 'application/vnd.google-apps.folder' },
        { id: 'f2', name: 'doc.md', mimeType: 'text/markdown', modifiedTime: '' },
      ]);
      mockDriveClientInstance.getFile.mockResolvedValue('content');
      fsMock.existsSync.mockReturnValue(true);
      await (artifact as any).pullFolder('root', '/local');
      expect(fsMock.writeFileSync).toHaveBeenCalledWith('/local/doc.md', 'content');
    });
  });

  describe('selectTask', () => {
    beforeEach(async () => { await (artifact as any).ensureInitialized(); });

    it('should update config and save', async () => {
      await artifact.selectTask('Task', 'id', 'folder', 'sprints');
      expect(mockSaveConfig).toHaveBeenCalledWith(projectRoot, expect.objectContaining({
        selectedTask: 'Task', selectedTaskId: 'id',
        selectedTaskFolderId: 'folder', selectedTaskType: 'sprints',
      }));
    });
  });

  describe('pushToFolder', () => {
    beforeEach(async () => { await (artifact as any).ensureInitialized(); });

    it('should throw if .planning missing', async () => {
      fsMock.existsSync.mockReturnValue(false);
      await expect(artifact.pushToFolder('target')).rejects.toThrow('.planning folder not found');
    });

    it('should upload and auto-pull', async () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue([]);
      mockDriveClientInstance.listFiles.mockResolvedValue([]);
      await expect(artifact.pushToFolder('target')).resolves.toBeUndefined();
    });
  });

  describe('pushTechDocs', () => {
    beforeEach(async () => { await (artifact as any).ensureInitialized(); });

    it('should throw if no active task', async () => {
      (artifact as any).config.selectedTaskId = undefined;
      await expect(artifact.pushTechDocs()).rejects.toThrow('No active task');
    });

    it('should throw if tech docs folder not found', async () => {
      mockDriveClientInstance.listFiles.mockResolvedValue([]);
      await expect(artifact.pushTechDocs()).rejects.toThrow('02. Technical Documents folder not found');
    });

    it('should push to tech docs', async () => {
      mockDriveClientInstance.listFiles.mockResolvedValue([
        { id: 'td1', name: '02. Technical Documents', mimeType: 'application/vnd.google-apps.folder', modifiedTime: '' },
      ]);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue([]);
      await expect(artifact.pushTechDocs()).resolves.toBeUndefined();
    });
  });

  describe('status', () => {
    it('should return status when initialized', async () => {
      const status = await artifact.status();
      expect(status.initialized).toBe(true);
      expect(status.selectedTask).toBe('IDS-001 Test task');
    });

    it('should return status when not initialized', async () => {
      mockLoadConfig.mockResolvedValue(null);
      const status = await artifact.status();
      expect(status.initialized).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return config', async () => {
      expect(await artifact.getConfig()).toBeDefined();
    });
  });
});
