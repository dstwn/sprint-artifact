import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  SprintArtifactConfig,
  AuthConfig,
  BacklogItem,
  Sprint,
  Task,
  Manifest,
} from '../types/index.js';
import {
  loadConfig,
  saveConfig,
  loadAuth,
  saveAuth,
  getDefaultConfig,
} from '../utils/config.js';
import { GoogleDriveClient } from './google-drive.js';

export class SprintArtifact {
  private projectRoot: string;
  private config: SprintArtifactConfig | null = null;
  private auth: AuthConfig | null = null;
  private driveClient: GoogleDriveClient | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async init(folderId: string, year?: string): Promise<void> {
    const currentYear = year || new Date().getFullYear().toString();
    this.config = {
      ...getDefaultConfig(),
      googleDrive: { folderId, year: currentYear },
    };
    await saveConfig(this.projectRoot, this.config);

    this.driveClient = null;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.config) {
      this.config = await loadConfig(this.projectRoot);
      if (!this.config) {
        throw new Error('Project not initialized. Run `sprint-artifact init` first.');
      }
    }

    if (!this.auth) {
      this.auth = await loadAuth(this.projectRoot);
      if (!this.auth) {
        throw new Error('Authentication not configured. Add auth.json to .sprint-artifact/');
      }
    }

    if (!this.driveClient) {
      this.driveClient = new GoogleDriveClient(this.auth);
    }
  }

  async createBacklog(taskId: string, title: string, folderId: string): Promise<void> {
    await this.ensureInitialized();

    const folderName = `${taskId} ${title}`;

    // Create task folder
    const taskFolderId = await this.driveClient!.createFolder(folderName, folderId);

    // Create subfolders
    await this.driveClient!.createFolder('01. Business Requirement Documents', taskFolderId);
    await this.driveClient!.createFolder('02. Technical Documents', taskFolderId);
    await this.driveClient!.createFolder('03. Testing Documents', taskFolderId);
    await this.driveClient!.createFolder('04. User Acceptance Test Documents', taskFolderId);
    await this.driveClient!.createFolder('05. Guide Documents', taskFolderId);

    // Copy BRD template if exists
    const brdTemplatePath = join(this.projectRoot, 'docs', 'brd');
    if (existsSync(brdTemplatePath)) {
      // TODO: Copy template files
    }

    await this.syncManifest();
  }

  async sync(): Promise<{ added: number; updated: number; deleted: number }> {
    await this.ensureInitialized();

    const remoteFiles = await this.driveClient!.listFiles(this.config!.googleDrive.folderId);
    const localManifest = this.config!.manifest || { lastSync: '', files: [] };

    const remoteMap = new Map(remoteFiles.map((f) => [f.id, f]));
    const localMap = new Map(localManifest.files.map((f) => [f.id, f]));

    let added = 0;
    let updated = 0;
    let deleted = 0;

    for (const [id, remote] of remoteMap) {
      const local = localMap.get(id);
      if (!local) {
        added++;
      } else if (local.modifiedTime !== remote.modifiedTime || local.md5Checksum !== remote.md5Checksum) {
        updated++;
      }
    }

    for (const [id] of localMap) {
      if (!remoteMap.has(id)) {
        deleted++;
      }
    }

    const manifest: Manifest = {
      lastSync: new Date().toISOString(),
      files: remoteFiles,
    };

    this.config!.manifest = manifest;
    await saveConfig(this.projectRoot, this.config!);

    return { added, updated, deleted };
  }

  async moveToSprint(backlogItemId: string, sprintId: string): Promise<void> {
    await this.ensureInitialized();

    const files = await this.driveClient!.listFiles(this.config!.googleDrive.folderId);
    const file = files.find((f) => f.name === `${backlogItemId}.md`);

    if (!file) {
      throw new Error(`Backlog item ${backlogItemId} not found`);
    }

    const content = await this.driveClient!.getFile(file.id);
    const updatedContent = content.replace(
      /^sprint:.*$/m,
      `sprint: ${sprintId}`
    );

    await this.driveClient!.updateFile(file.id, updatedContent);
    await this.syncManifest();
  }

  async selectTask(taskId: string): Promise<void> {
    await this.ensureInitialized();

    this.config!.selectedTask = taskId;
    await saveConfig(this.projectRoot, this.config!);
  }

  async status(): Promise<{
    initialized: boolean;
    folderId: string;
    year: string;
    selectedTask?: string;
    lastSync?: string;
    fileCount: number;
  }> {
    const config = await loadConfig(this.projectRoot);
    const initialized = !!config;

    return {
      initialized,
      folderId: config?.googleDrive.folderId || '',
      year: config?.googleDrive.year || '',
      selectedTask: config?.selectedTask,
      lastSync: config?.manifest?.lastSync,
      fileCount: config?.manifest?.files.length || 0,
    };
  }

  async getConfig(): Promise<SprintArtifactConfig | null> {
    return loadConfig(this.projectRoot);
  }

  private async syncManifest(): Promise<void> {
    const remoteFiles = await this.driveClient!.listFiles(this.config!.googleDrive.folderId);
    this.config!.manifest = {
      lastSync: new Date().toISOString(),
      files: remoteFiles,
    };
    await saveConfig(this.projectRoot, this.config!);
  }

  private formatBacklogItem(item: BacklogItem): string {
    return `---
id: ${item.id}
title: ${item.title}
priority: ${item.priority}
status: ${item.status}
created: ${item.createdAt}
updated: ${item.updatedAt}
---

# ${item.title}

${item.description}
`;
  }
}
