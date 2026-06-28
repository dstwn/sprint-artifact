import { describe, it, expect } from 'vitest';
import type {
  SprintArtifactConfig,
  Manifest,
  ManifestFile,
  AuthConfig,
  ServiceAccountCredentials,
  OAuth2Credentials,
  BacklogItem,
  Sprint,
  Task,
} from './index.js';

describe('types', () => {
  describe('SprintArtifactConfig', () => {
    it('should create minimal valid config', () => {
      const config: SprintArtifactConfig = {
        version: 1,
        googleDrive: {
          folderId: 'root123',
          year: '2026',
        },
      };
      expect(config.version).toBe(1);
      expect(config.googleDrive.folderId).toBe('root123');
      expect(config.googleDrive.year).toBe('2026');
    });

    it('should create config with all optional fields', () => {
      const manifest: Manifest = {
        lastSync: '2026-01-01T00:00:00Z',
        files: [],
      };
      const config: SprintArtifactConfig = {
        version: 1,
        googleDrive: {
          folderId: 'root123',
          year: '2026',
          defaultFolderId: 'default456',
          brdId: 'brd789',
          prdId: 'prd012',
          planningId: 'plan345',
        },
        selectedTask: 'IDS-001 Fix bug',
        selectedTaskId: 'task678',
        selectedTaskFolderId: 'folder901',
        selectedTaskType: 'backlogs',
        manifest,
      };
      expect(config.selectedTask).toBe('IDS-001 Fix bug');
      expect(config.selectedTaskType).toBe('backlogs');
      expect(config.manifest?.lastSync).toBe('2026-01-01T00:00:00Z');
    });

    it('should accept sprints as selectedTaskType', () => {
      const config: SprintArtifactConfig = {
        version: 1,
        googleDrive: { folderId: 'x', year: '2026' },
        selectedTaskType: 'sprints',
      };
      expect(config.selectedTaskType).toBe('sprints');
    });
  });

  describe('Manifest', () => {
    it('should create manifest with files', () => {
      const files: ManifestFile[] = [
        { id: 'f1', name: 'doc.md', mimeType: 'text/markdown', modifiedTime: '2026-01-01T00:00:00Z', md5Checksum: 'abc123' },
      ];
      const manifest: Manifest = { lastSync: '2026-01-01T00:00:00Z', files };
      expect(manifest.files).toHaveLength(1);
      expect(manifest.files[0].md5Checksum).toBe('abc123');
    });

    it('should create manifest file without optional md5Checksum', () => {
      const file: ManifestFile = {
        id: 'f1',
        name: 'doc.md',
        mimeType: 'text/markdown',
        modifiedTime: '2026-01-01T00:00:00Z',
      };
      expect(file.md5Checksum).toBeUndefined();
    });
  });

  describe('AuthConfig', () => {
    it('should create oauth2 auth config', () => {
      const credentials: OAuth2Credentials = {
        client_id: 'client123',
        client_secret: 'secret456',
        redirect_uris: ['http://localhost'],
        refresh_token: 'refresh789',
        access_token: 'access012',
        token_expiry: '2026-06-01T00:00:00Z',
      };
      const auth: AuthConfig = { type: 'oauth2', credentials };
      expect(auth.type).toBe('oauth2');
    });

    it('should create service_account auth config', () => {
      const credentials: ServiceAccountCredentials = {
        type: 'service_account',
        project_id: 'proj123',
        private_key_id: 'key456',
        private_key: '-----BEGIN PRIVATE KEY-----\n...',
        client_email: 'sa@proj.iam.gserviceaccount.com',
        client_id: '789',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: 'https://www.googleapis.com/...',
      };
      const auth: AuthConfig = { type: 'service_account', credentials };
      expect(auth.type).toBe('service_account');
      expect((auth.credentials as ServiceAccountCredentials).project_id).toBe('proj123');
    });

    it('should create OAuth2Credentials without optional fields', () => {
      const credentials: OAuth2Credentials = {
        client_id: 'client123',
        client_secret: 'secret456',
        redirect_uris: ['http://localhost'],
      };
      expect(credentials.refresh_token).toBeUndefined();
      expect(credentials.access_token).toBeUndefined();
      expect(credentials.token_expiry).toBeUndefined();
    });
  });

  describe('BacklogItem', () => {
    it('should create backlog item with all fields', () => {
      const item: BacklogItem = {
        id: 'IDS-001',
        title: 'Fix login bug',
        description: 'Users cannot login',
        priority: 'high',
        status: 'todo',
        sprint: 'Sprint 1',
        assignee: 'john',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      };
      expect(item.priority).toBe('high');
      expect(item.status).toBe('todo');
    });

    it('should accept all priority values', () => {
      const priorities: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];
      priorities.forEach(p => {
        const item: BacklogItem = {
          id: 'x', title: 'x', description: 'x',
          priority: p, status: 'todo',
          createdAt: '', updatedAt: '',
        };
        expect(item.priority).toBe(p);
      });
    });

    it('should accept all status values', () => {
      const statuses: Array<'todo' | 'in-progress' | 'done'> = ['todo', 'in-progress', 'done'];
      statuses.forEach(s => {
        const item: BacklogItem = {
          id: 'x', title: 'x', description: 'x',
          priority: 'medium', status: s,
          createdAt: '', updatedAt: '',
        };
        expect(item.status).toBe(s);
      });
    });

    it('should create backlog without optional fields', () => {
      const item: BacklogItem = {
        id: 'IDS-001',
        title: 'Fix bug',
        description: 'desc',
        priority: 'low',
        status: 'done',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      expect(item.sprint).toBeUndefined();
      expect(item.assignee).toBeUndefined();
    });
  });

  describe('Sprint', () => {
    it('should create sprint', () => {
      const sprint: Sprint = {
        id: 'S1',
        name: 'Sprint 1',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
        goals: ['Fix bugs', 'Add features'],
        backlogItems: ['IDS-001', 'IDS-002'],
      };
      expect(sprint.goals).toHaveLength(2);
      expect(sprint.backlogItems).toHaveLength(2);
    });
  });

  describe('Task', () => {
    it('should create task with all fields', () => {
      const task: Task = {
        id: 'T1',
        title: 'Implement login',
        description: 'desc',
        status: 'in-progress',
        backlogItemId: 'IDS-001',
        sprintId: 'S1',
        assignee: 'john',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      expect(task.status).toBe('in-progress');
    });

    it('should create task without optional fields', () => {
      const task: Task = {
        id: 'T1',
        title: 'Test',
        description: 'desc',
        status: 'todo',
        backlogItemId: 'IDS-001',
        createdAt: '',
        updatedAt: '',
      };
      expect(task.sprintId).toBeUndefined();
      expect(task.assignee).toBeUndefined();
    });
  });
});
