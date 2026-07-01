import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import type {
  SprintArtifactConfig,
  AuthConfig,
  ManifestFile,
} from '../types/index.js';
import {
  loadConfig,
  saveConfig,
  loadAuth,
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

    // Auto-select as active task
    this.config!.selectedTask = folderName;
    this.config!.selectedTaskId = taskFolderId;
    this.config!.selectedTaskFolderId = folderId;
    this.config!.selectedTaskType = 'backlogs';

    // Pull task locally
    const localPath = join(this.projectRoot, '.sprint-artifact', 'backlogs');
    if (!existsSync(localPath)) {
      mkdirSync(localPath, { recursive: true });
    }
    const taskPath = join(localPath, folderName);
    mkdirSync(taskPath, { recursive: true });

    // Pull subfolders
    await this.pullFolder(taskFolderId, taskPath);

    // Sync manifest from task folder
    const remoteFiles = await this.getAllFilesRecursive(taskFolderId);
    this.config!.manifest = {
      lastSync: new Date().toISOString(),
      files: remoteFiles,
    };
    await saveConfig(this.projectRoot, this.config!);
  }

  async sync(): Promise<{ added: number; updated: number; deleted: number }> {
    await this.ensureInitialized();

    if (!this.config!.selectedTaskId || !this.config!.selectedTask) {
      throw new Error('No active task selected. Run `sprint-artifact select` first.');
    }

    const taskType = this.config!.selectedTaskType || 'backlogs';
    const localPath = join(this.projectRoot, '.sprint-artifact', taskType);
    const taskPath = join(localPath, this.config!.selectedTask);

    if (!existsSync(taskPath)) {
      mkdirSync(taskPath, { recursive: true });
    }

    // Step 1: Pull all remote files (download to local)
    await this.pullFolder(this.config!.selectedTaskId, taskPath);

    // Step 2: Upload local files not on remote
    let uploaded = 0;
    await this.uploadLocalFiles(taskPath, this.config!.selectedTaskId, () => uploaded++);

    // Step 4: Update manifest
    const allRemoteFiles = await this.getAllFilesRecursive(this.config!.selectedTaskId);
    this.config!.manifest = {
      lastSync: new Date().toISOString(),
      files: allRemoteFiles,
    };
    await saveConfig(this.projectRoot, this.config!);

    let localCount = 0;
    this.countLocalFilesRecursive(taskPath, () => localCount++);

    return { added: allRemoteFiles.length, updated: 0, deleted: 0 };
  }

  private async uploadLocalFiles(
    localDir: string,
    remoteParentId: string,
    onUpload: () => void,
  ): Promise<void> {
    const items = readdirSync(localDir);
    const remoteItems = await this.driveClient!.listFiles(remoteParentId);

    for (const item of items) {
      const itemPath = join(localDir, item);
      const stat = statSync(itemPath);

      if (stat.isDirectory()) {
        const subfolder = remoteItems.find(
          f => f.name === item && f.mimeType === 'application/vnd.google-apps.folder',
        );
        const subfolderId = subfolder
          ? subfolder.id
          : await this.driveClient!.createFolder(item, remoteParentId);
        await this.uploadLocalFiles(itemPath, subfolderId, onUpload);
      } else if (stat.isFile()) {
        const exists = remoteItems.some(f => f.name === item && f.mimeType !== 'application/vnd.google-apps.folder');
        if (!exists) {
          const content = readFileSync(itemPath, 'utf-8');
          await this.driveClient!.createFile(item, content, remoteParentId);
          onUpload();
        }
      }
    }
  }

  private async downloadFile(fileId: string, targetDir: string, fileName: string): Promise<void> {
    const content = await this.driveClient!.getFile(fileId);
    writeFileSync(join(targetDir, fileName), content);
  }

  private async getAllFilesRecursive(folderId: string): Promise<ManifestFile[]> {
    const items = await this.driveClient!.listFiles(folderId);
    let files: ManifestFile[] = [];
    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const subFiles = await this.getAllFilesRecursive(item.id);
        files = files.concat(subFiles);
      } else {
        files.push(item);
      }
    }
    return files;
  }

  private countLocalFilesRecursive(dir: string, count: () => void): void {
    try {
      const items = readdirSync(dir);
      for (const item of items) {
        const itemPath = join(dir, item);
        const stat = statSync(itemPath);
        if (stat.isFile()) {
          count();
        } else if (stat.isDirectory()) {
          this.countLocalFilesRecursive(itemPath, count);
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  async moveToSprint(taskFolderId: string, newParentFolderId: string, taskName?: string): Promise<void> {
    await this.ensureInitialized();

    // Move folder in Google Drive
    await this.driveClient!.moveFile(taskFolderId, newParentFolderId);

    const name = taskName || this.config!.selectedTask;

    // Move local folder if it exists
    const oldPath = join(this.projectRoot, '.sprint-artifact', 'backlogs', name || '');
    const newPath = join(this.projectRoot, '.sprint-artifact', 'sprints', name || '');

    if (name && existsSync(oldPath)) {
      if (!existsSync(join(this.projectRoot, '.sprint-artifact', 'sprints'))) {
        mkdirSync(join(this.projectRoot, '.sprint-artifact', 'sprints'), { recursive: true });
      }
      renameSync(oldPath, newPath);
    }

    // Update config if this is the selected task
    if (this.config!.selectedTaskId === taskFolderId) {
      this.config!.selectedTaskFolderId = newParentFolderId;
      this.config!.selectedTaskType = 'sprints';
      await saveConfig(this.projectRoot, this.config!);
    }

    await this.syncManifest();
  }

  async pullTask(taskFolderId: string, taskName: string, localPath: string): Promise<void> {
    await this.ensureInitialized();

    const taskPath = join(localPath, taskName);
    if (!existsSync(taskPath)) {
      mkdirSync(taskPath, { recursive: true });
    }

    // Recursively pull
    await this.pullFolder(taskFolderId, taskPath);
  }

  private async pullFolder(folderId: string, localPath: string): Promise<void> {
    const items = await this.driveClient!.listFiles(folderId);
    
    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const folderPath = join(localPath, item.name);
        if (!existsSync(folderPath)) {
          mkdirSync(folderPath, { recursive: true });
        }
        await this.pullFolder(item.id, folderPath);
      } else if (this.driveClient!.isGoogleDocsFile(item.mimeType)) {
        const exportInfo = this.driveClient!.getExportMimeType(item.mimeType);
        if (exportInfo) {
          const exportPath = join(localPath, item.name + exportInfo.ext);
          const content = await this.driveClient!.exportFile(item.id, exportInfo.mimeType);
          writeFileSync(exportPath, content);
        }
      } else {
        const itemPath = join(localPath, item.name);
        const content = await this.driveClient!.getFile(item.id);
        writeFileSync(itemPath, content);
      }
    }
  }

  async selectTask(taskName: string, taskId: string, folderId: string, taskType?: 'backlogs' | 'sprints'): Promise<void> {
    await this.ensureInitialized();

    this.config!.selectedTask = taskName;
    this.config!.selectedTaskId = taskId;
    this.config!.selectedTaskFolderId = folderId;
    this.config!.selectedTaskType = taskType;
    await saveConfig(this.projectRoot, this.config!);
  }

  async pushToFolder(targetFolderId: string): Promise<void> {
    await this.ensureInitialized();

    const planningPath = join(this.projectRoot, '.planning');
    if (!existsSync(planningPath)) {
      throw new Error('.planning folder not found.');
    }

    await this.uploadFolder(planningPath, targetFolderId);

    // Auto pull after push
    if (this.config!.selectedTaskId && this.config!.selectedTask) {
      const taskType = this.config!.selectedTaskType || 'backlogs';
      const targetPath = join(this.projectRoot, '.sprint-artifact', taskType);
      await this.pullTask(this.config!.selectedTaskId, this.config!.selectedTask, targetPath);
    }
  }

  private async uploadFolder(localPath: string, parentFolderId: string): Promise<void> {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const items = readdirSync(localPath);
    
    for (const item of items) {
      const itemPath = join(localPath, item);
      const stat = statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Create folder in Google Drive
        const folderId = await this.driveClient!.createFolder(item, parentFolderId);
        // Recursively upload folder contents
        await this.uploadFolder(itemPath, folderId);
      } else {
        // Upload file
        const content = readFileSync(itemPath, 'utf-8');
        await this.driveClient!.createFile(item, content, parentFolderId);
      }
    }
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

    await this.pushToFolder(techDocsFolder.id);
  }

  async status(): Promise<{
    initialized: boolean;
    rootFolderId: string;
    year: string;
    defaultFolderId?: string;
    selectedTask?: string;
    selectedTaskId?: string;
    selectedTaskFolderId?: string;
    selectedTaskType?: string;
    lastSync?: string;
    fileCount: number;
  }> {
    const config = await loadConfig(this.projectRoot);
    const initialized = !!config;

    return {
      initialized,
      rootFolderId: config?.googleDrive.folderId || '',
      year: config?.googleDrive.year || '',
      defaultFolderId: config?.googleDrive.defaultFolderId,
      selectedTask: config?.selectedTask,
      selectedTaskId: config?.selectedTaskId,
      selectedTaskFolderId: config?.selectedTaskFolderId,
      selectedTaskType: config?.selectedTaskType,
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
}
