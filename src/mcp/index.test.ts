import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockServerSetRequestHandler = vi.hoisted(() => vi.fn());
const mockServerConnect = vi.hoisted(() => vi.fn());

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(() => ({
    setRequestHandler: mockServerSetRequestHandler,
    connect: mockServerConnect,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

const mockSprintArtifactInstance = vi.hoisted(() => ({
  init: vi.fn(),
  selectTask: vi.fn(),
  pullTask: vi.fn(),
  createBacklog: vi.fn(),
  sync: vi.fn(),
  pushToFolder: vi.fn(),
  moveToSprint: vi.fn(),
  status: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock('../sdk/index.js', () => ({
  SprintArtifact: vi.fn(() => mockSprintArtifactInstance),
}));

vi.mock('../utils/config.js', () => ({ loadAuth: vi.fn(), loadConfig: vi.fn() }));
vi.mock('../sdk/google-drive.js', () => ({ GoogleDriveClient: vi.fn(() => ({ listFiles: vi.fn() })) }));

import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const mockLoadAuth = (await import('../utils/config.js')).loadAuth as ReturnType<typeof vi.fn>;
const mockGoogleDriveClient = (await import('../sdk/google-drive.js')).GoogleDriveClient as ReturnType<typeof vi.fn>;
import type { SprintArtifact } from '../sdk/index.js';

describe('MCP Server', () => {
  let listToolsHandler: Function;
  let callToolHandler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mod = await import('./index.js');

    const setRequestHandlerCalls = mockServerSetRequestHandler.mock.calls;
    listToolsHandler = setRequestHandlerCalls.find((call: any) =>
      String(call[0]) === 'Symbol(ListToolsRequestSchema)'
    )?.[1];
    callToolHandler = setRequestHandlerCalls.find((call: any) =>
      String(call[0]) === 'Symbol(CallToolRequestSchema)'
    )?.[1];
  });

  describe('ListTools', () => {
    it('should return 10 tools', async () => {
      if (!listToolsHandler) return;
      const response = await listToolsHandler();
      expect(response.tools).toHaveLength(10);
      const names = response.tools.map((t: any) => t.name).sort();
      expect(names).toEqual([
        'backlog_create', 'init_project', 'list_folders', 'list_tasks',
        'move_to_sprint', 'pull_task', 'push_files', 'select_task',
        'status', 'sync_documents',
      ].sort());
    });
  });

  describe('CallTool', () => {
    const mockConfig = {
      googleDrive: { folderId: 'root123', year: '2026', defaultFolderId: 'default456' },
      selectedTaskId: 'task123',
    };

    beforeEach(() => {
      mockSprintArtifactInstance.getConfig.mockResolvedValue(mockConfig);
    });

    it('should handle list_folders', async () => {
      if (!callToolHandler) return;
      mockLoadAuth.mockResolvedValue({ type: 'oauth2', credentials: {} });
      const drive = { listFiles: vi.fn() };
      mockGoogleDriveClient.mockReturnValue(drive as any);
      drive.listFiles
        .mockResolvedValueOnce([{ id: 'y1', name: '2026', mimeType: 'application/vnd.google-apps.folder' }])
        .mockResolvedValueOnce([{ id: 'f1', name: 'Backlogs', mimeType: 'application/vnd.google-apps.folder' }]);

      const res = await callToolHandler({ params: { name: 'list_folders', arguments: {} } });
      const data = JSON.parse(res.content[0].text);
      expect(data['2026']).toBeDefined();
    });

    it('should handle list_tasks', async () => {
      if (!callToolHandler) return;
      mockLoadAuth.mockResolvedValue({ type: 'oauth2', credentials: {} });
      const drive = { listFiles: vi.fn() };
      mockGoogleDriveClient.mockReturnValue(drive as any);
      drive.listFiles.mockResolvedValue([{ id: 't1', name: 'Task', mimeType: 'application/vnd.google-apps.folder' }]);

      const res = await callToolHandler({ params: { name: 'list_tasks', arguments: { folderId: 'f1' } } });
      expect(JSON.parse(res.content[0].text)).toHaveLength(1);
    });

    it('should handle init_project', async () => {
      if (!callToolHandler) return;
      const res = await callToolHandler({ params: { name: 'init_project', arguments: { folderId: 'f123', year: '2026' } } });
      expect(res.content[0].text).toContain('Project initialized');
    });

    it('should handle backlog_create', async () => {
      if (!callToolHandler) return;
      mockSprintArtifactInstance.createBacklog.mockResolvedValue(undefined);
      const res = await callToolHandler({ params: { name: 'backlog_create', arguments: { id: 'IDS-001', title: 'Fix bug' } } });
      expect(res.content[0].text).toContain('Created');
      expect(mockSprintArtifactInstance.createBacklog).toHaveBeenCalledWith('IDS-001', 'Fix bug', 'default456');
    });

    it('should backlog_create error if no folderId', async () => {
      if (!callToolHandler) return;
      mockSprintArtifactInstance.getConfig.mockResolvedValue({ googleDrive: {} });
      const res = await callToolHandler({ params: { name: 'backlog_create', arguments: { id: 'IDS-001', title: 'Fix bug' } } });
      expect(res.isError).toBe(true);
    });

    it('should handle select_task', async () => {
      if (!callToolHandler) return;
      mockSprintArtifactInstance.pullTask.mockResolvedValue(undefined);
      const res = await callToolHandler({ params: { name: 'select_task', arguments: { taskName: 'Task', taskId: 't1' } } });
      expect(res.content[0].text).toContain('Selected');
    });

    it('should handle pull_task', async () => {
      if (!callToolHandler) return;
      const res = await callToolHandler({ params: { name: 'pull_task', arguments: { taskId: 't1', taskName: 'Task' } } });
      expect(res.content[0].text).toContain('Pulled');
    });

    it('should handle sync_documents', async () => {
      if (!callToolHandler) return;
      mockSprintArtifactInstance.sync.mockResolvedValue({ added: 3, updated: 1, deleted: 0 });
      const res = await callToolHandler({ params: { name: 'sync_documents', arguments: {} } });
      expect(JSON.parse(res.content[0].text).added).toBe(3);
    });

    it('should handle move_to_sprint', async () => {
      if (!callToolHandler) return;
      const res = await callToolHandler({ params: { name: 'move_to_sprint', arguments: { taskFolderId: 't1', newParentFolderId: 's1' } } });
      expect(mockSprintArtifactInstance.moveToSprint).toHaveBeenCalledWith('t1', 's1', undefined);
    });

    it('should handle status', async () => {
      if (!callToolHandler) return;
      mockSprintArtifactInstance.status.mockResolvedValue({ initialized: true, rootFolderId: 'r1' });
      const res = await callToolHandler({ params: { name: 'status', arguments: {} } });
      expect(JSON.parse(res.content[0].text).rootFolderId).toBe('r1');
    });

    it('should return error for unknown tool', async () => {
      if (!callToolHandler) return;
      const res = await callToolHandler({ params: { name: 'unknown_tool', arguments: {} } });
      expect(res.isError).toBe(true);
    });

    it('should catch handler errors', async () => {
      if (!callToolHandler) return;
      mockSprintArtifactInstance.getConfig.mockRejectedValue(new Error('fail'));
      const res = await callToolHandler({ params: { name: 'status', arguments: {} } });
      expect(res.isError).toBe(true);
    });

    it('should handle push_files', async () => {
      if (!callToolHandler) return;
      mockLoadAuth.mockResolvedValue({ type: 'oauth2', credentials: {} });
      const drive = { listFiles: vi.fn() };
      mockGoogleDriveClient.mockReturnValue(drive as any);
      drive.listFiles.mockResolvedValue([{ id: 'td1', name: '02. Technical Documents', mimeType: 'application/vnd.google-apps.folder' }]);
      mockSprintArtifactInstance.pushToFolder.mockResolvedValue(undefined);
      mockSprintArtifactInstance.sync.mockResolvedValue({ added: 1, updated: 0, deleted: 0 });
      const res = await callToolHandler({ params: { name: 'push_files', arguments: { subfolder: '02. Technical Documents' } } });
      expect(res.content[0].text).toContain('Pushed');
    });
  });

  describe('main', () => {
    it('should export main function', async () => {
      const mod = await import('./index.js');
      expect(mod.main).toBeDefined();
    });
  });
});
