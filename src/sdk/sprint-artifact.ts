import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

  async init(folderId: string, year?: string, defaultFolderId?: string): Promise<void> {
    const currentYear = year || new Date().getFullYear().toString();
    this.config = {
      ...getDefaultConfig(),
      googleDrive: { folderId, year: currentYear, defaultFolderId },
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

  async pullTask(taskFolderId: string, taskName: string, localPath: string): Promise<void> {
    await this.ensureInitialized();

    const taskPath = join(localPath, taskName);
    if (!existsSync(taskPath)) {
      mkdirSync(taskPath, { recursive: true });
    }

    // Get subfolders
    const subfolders = await this.driveClient!.listFiles(taskFolderId);
    
    for (const folder of subfolders) {
      if (folder.mimeType === 'application/vnd.google-apps.folder') {
        const folderPath = join(taskPath, folder.name);
        if (!existsSync(folderPath)) {
          mkdirSync(folderPath, { recursive: true });
        }

        // Get files in subfolder
        const files = await this.driveClient!.listFiles(folder.id);
        for (const file of files) {
          if (file.mimeType !== 'application/vnd.google-apps.folder') {
            const content = await this.driveClient!.getFile(file.id);
            writeFileSync(join(folderPath, file.name), content);
          }
        }
      }
    }

    this.config!.selectedTask = taskName;
    await saveConfig(this.projectRoot, this.config!);
  }

  async selectTask(taskName: string, taskId: string, folderId: string): Promise<void> {
    await this.ensureInitialized();

    this.config!.selectedTask = taskName;
    this.config!.selectedTaskId = taskId;
    this.config!.selectedTaskFolderId = folderId;
    await saveConfig(this.projectRoot, this.config!);
  }

  async pushTechDocs(): Promise<void> {
    await this.ensureInitialized();

    if (!this.config!.selectedTaskId) {
      throw new Error('No active task selected. Run `sprint-artifact select` first.');
    }

    // Find the task folder in Google Drive
    const taskFolderId = this.config!.selectedTaskId;
    
    // Find "02. Technical Documents" subfolder
    const subfolders = await this.driveClient!.listFiles(taskFolderId);
    const techDocsFolder = subfolders.find(f => f.name === '02. Technical Documents' && f.mimeType === 'application/vnd.google-apps.folder');
    
    if (!techDocsFolder) {
      throw new Error('02. Technical Documents folder not found in task.');
    }

    // Read files from local .planning folder
    const planningPath = join(this.projectRoot, '.planning');
    if (!existsSync(planningPath)) {
      throw new Error('.planning folder not found.');
    }

    // Upload files to Google Drive
    const { readdirSync, readFileSync } = await import('node:fs');
    const files = readdirSync(planningPath);
    
    for (const file of files) {
      const filePath = join(planningPath, file);
      const content = readFileSync(filePath, 'utf-8');
      await this.driveClient!.createFile(file, content, techDocsFolder.id);
    }
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
