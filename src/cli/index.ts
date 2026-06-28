#!/usr/bin/env node

import { Command } from 'commander';
import { SprintArtifact } from '../sdk/index.js';
import { resolve, join } from 'node:path';
import { login } from '../utils/oauth2.js';
import { saveAuth } from '../utils/config.js';
import { select, input } from '@inquirer/prompts';

const program = new Command();

program
  .name('sprint-artifact')
  .description('Sprint Artifact management tool with Google Drive integration')
  .version('0.1.0');

program
  .command('select')
  .description('Select active task')
  .option('--task-id <id>', 'Task ID (e.g., IDS-123)')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      
      const { loadAuth, loadConfig } = await import('../utils/config.js');
      const auth = await loadAuth(projectRoot);
      const config = await loadConfig(projectRoot);
      
      if (!auth || !config) {
        console.error('✗ Not initialized. Run `sprint-artifact init` first.');
        process.exit(1);
      }

      const { GoogleDriveClient } = await import('../sdk/google-drive.js');
      const driveClient = new GoogleDriveClient(auth);

      // Get year folder
      const yearFolders = await driveClient.listFiles(config.googleDrive.folderId);
      const yearFolder = yearFolders.find(f => f.name === config.googleDrive.year && f.mimeType === 'application/vnd.google-apps.folder');
      
      if (!yearFolder) {
        console.error(`✗ Year folder "${config.googleDrive.year}" not found.`);
        process.exit(1);
      }

      // Get folders inside year folder (Backlogs, Sprint 1, etc.)
      const subFolders = await driveClient.listFiles(yearFolder.id);
      const folders = subFolders.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      if (folders.length === 0) {
        console.error('✗ No folders found.');
        process.exit(1);
      }

      // Step 1: Select folder
      const selectedFolderId = await select({
        message: 'Select folder:',
        choices: folders.map(f => ({ name: f.name, value: f.id })),
      });
      const selectedFolderName = folders.find(f => f.id === selectedFolderId)?.name || '';

      // Step 2: Get tasks from selected folder
      const tasks = await driveClient.listFiles(selectedFolderId);
      const taskFolders = tasks.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      if (taskFolders.length === 0) {
        console.error('✗ No tasks found in folder.');
        process.exit(1);
      }

      // Step 3: Select task
      let selectedTask: { name: string; id: string };

      if (options.taskId) {
        const task = taskFolders.find(t => t.name.startsWith(options.taskId));
        if (!task) {
          console.error(`✗ Task "${options.taskId}" not found.`);
          process.exit(1);
        }
        selectedTask = task;
      } else {
        selectedTask = await select({
          message: 'Select task:',
          choices: taskFolders.map(t => ({ name: t.name, value: { name: t.name, id: t.id } })),
        });
      }

      const taskType = selectedFolderName.toLowerCase().includes('sprint') ? 'sprints' : 'backlogs';
      await artifact.selectTask(selectedTask.name, selectedTask.id, selectedFolderId, taskType);
      
      // Auto pull
      const targetPath = join(projectRoot, '.sprint-artifact', taskType);
      await artifact.pullTask(selectedTask.id, selectedTask.name, targetPath);
      
      console.log(`✓ Active task: ${selectedTask.name}`);
      console.log(`  Folder: ${selectedFolderName}`);
      console.log(`  Pulled to: .sprint-artifact/${taskType}/${selectedTask.name}/`);
    } catch (error) {
      console.error('✗ Failed to select task:', error);
      process.exit(1);
    }
  });

program
  .command('push')
  .description('Push files to Google Drive')
  .option('--tech-docs', 'Push to 02. Technical Documents')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      
      const { loadConfig, loadAuth } = await import('../utils/config.js');
      const config = await loadConfig(projectRoot);
      const auth = await loadAuth(projectRoot);
      
      if (!config?.selectedTaskId || !auth) {
        console.error('✗ No active task. Run `sprint-artifact select` first.');
        process.exit(1);
      }

      const { GoogleDriveClient } = await import('../sdk/google-drive.js');
      const driveClient = new GoogleDriveClient(auth);

      // Get subfolders from active task
      const subfolders = await driveClient.listFiles(config.selectedTaskId);
      const folders = subfolders.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      let targetFolderId: string;
      let targetFolderName: string;

      if (options.techDocs) {
        const techDocsFolder = folders.find(f => f.name === '02. Technical Documents');
        if (!techDocsFolder) {
          console.error('✗ 02. Technical Documents folder not found.');
          process.exit(1);
        }
        targetFolderId = techDocsFolder.id;
        targetFolderName = techDocsFolder.name;
      } else {
        // Interactive select
        const selected = await select({
          message: 'Select destination:',
          choices: folders.map(f => ({ name: f.name, value: f.id })),
        });
        targetFolderId = selected;
        targetFolderName = folders.find(f => f.id === selected)?.name || '';
      }

      await artifact.pushToFolder(targetFolderId);
      
      // Auto sync after push
      await artifact.sync();
      
      console.log(`✓ Pushed to ${targetFolderName}`);
      console.log('✓ Synced');
    } catch (error) {
      console.error('✗ Failed to push:', error);
      process.exit(1);
    }
  });

program
  .command('login')
  .description('Login with Google account (auto-detect credentials)')
  .option('--credentials <path>', 'Path to OAuth2 credentials JSON file')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const credentials = await login({
        credentialsPath: options.credentials,
      });
      
      await saveAuth(projectRoot, {
        type: 'oauth2',
        credentials,
      });

      console.log('✓ Login successful');
      console.log('  Auth saved to .sprint-artifact/auth.json');
    } catch (error) {
      console.error('✗ Login failed:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize a new Sprint Artifact project')
  .option('--folder-id <id>', 'Google Drive folder ID')
  .option('--year <year>', 'Year folder (e.g., 2026)')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      
      // Load auth first to access Google Drive
      const { loadAuth } = await import('../utils/config.js');
      const auth = await loadAuth(projectRoot);
      if (!auth) {
        console.error('✗ Not logged in. Run `sprint-artifact login` first.');
        process.exit(1);
      }

      // Ask for folder ID if not provided
      const folderId = options.folderId || await input({
        message: 'Enter Google Drive folder ID:',
        validate: (value) => value.length > 0 || 'Folder ID is required',
      });

      // Get year folders from Google Drive
      const { GoogleDriveClient } = await import('../sdk/google-drive.js');
      const driveClient = new GoogleDriveClient(auth);
      const folders = await driveClient.listFiles(folderId);
      const yearFolders = folders
        .filter(f => f.mimeType === 'application/vnd.google-apps.folder' && /^\d{4}$/.test(f.name))
        .map(f => f.name)
        .sort((a, b) => b.localeCompare(a)); // Newest first

      const currentYear = new Date().getFullYear().toString();
      const allYears = yearFolders.includes(currentYear) ? yearFolders : [currentYear, ...yearFolders];

      const year = options.year || await select({
        message: 'Select year:',
        choices: allYears.map(y => ({ name: y, value: y })),
      });

      // Get folders inside year folder
      const yearFolderId = folders.find(f => f.name === year)?.id;
      if (!yearFolderId) {
        console.error(`✗ Year folder "${year}" not found.`);
        process.exit(1);
      }

      const yearContents = await driveClient.listFiles(yearFolderId);
      const subFolders = yearContents.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      if (subFolders.length === 0) {
        console.error('✗ No folders found in year folder.');
        process.exit(1);
      }

      // Let user select default folder (Backlogs, Sprint 1, etc.)
      const defaultFolderId = await select({
        message: 'Select default folder for backlogs:',
        choices: subFolders.map(f => ({ name: f.name, value: f.id })),
      });

      await artifact.init(folderId, year, defaultFolderId);
      console.log('✓ Sprint Artifact project initialized');
      console.log(`  Folder ID: ${folderId}`);
      console.log(`  Year: ${year}`);
      console.log('  Config: .sprint-artifact/config.json');
    } catch (error) {
      console.error('✗ Failed to initialize:', error);
      process.exit(1);
    }
  });

const backlogCmd = program
  .command('backlog')
  .description('Manage backlog items');

backlogCmd
  .command('create')
  .description('Create a new backlog item')
  .requiredOption('--id <id>', 'Task ID (e.g., IDS-123)')
  .requiredOption('--title <title>', 'Task title')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      
      // Load config to get default folder
      const { loadConfig } = await import('../utils/config.js');
      const config = await loadConfig(projectRoot);
      
      if (!config?.googleDrive.defaultFolderId) {
        console.error('✗ No default folder set. Run `sprint-artifact init` first.');
        process.exit(1);
      }

      await artifact.createBacklog(options.id, options.title, config.googleDrive.defaultFolderId);
      console.log('✓ Backlog item created');
      console.log(`  ID: ${options.id}`);
      console.log(`  Title: ${options.title}`);
    } catch (error) {
      console.error('✗ Failed to create backlog item:', error);
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Sync documents with Google Drive')
  .action(async () => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      const result = await artifact.sync();
      console.log('✓ Sync completed');
      console.log(`  Added: ${result.added}`);
      console.log(`  Updated: ${result.updated}`);
      console.log(`  Deleted: ${result.deleted}`);
    } catch (error) {
      console.error('✗ Sync failed:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show project status')
  .action(async () => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      const status = await artifact.status();
      console.log('Sprint Artifact Status');
      console.log('─'.repeat(40));
      console.log(`Initialized: ${status.initialized ? 'Yes' : 'No'}`);
      if (status.initialized) {
        console.log(`Folder ID: ${status.folderId}`);
        console.log(`Year: ${status.year}`);
        console.log(`Selected Task: ${status.selectedTask || 'None'}`);
        console.log(`Last Sync: ${status.lastSync || 'Never'}`);
        console.log(`Files: ${status.fileCount}`);
      }
    } catch (error) {
      console.error('✗ Failed to get status:', error);
      process.exit(1);
    }
  });

program
  .command('pull')
  .description('Pull tasks from Google Drive')
  .option('--backlog', 'Pull from Backlogs folder')
  .option('--sprint <name>', 'Pull from Sprint folder (e.g., "Sprint 1")')
  .option('--task-id <id>', 'Task ID to pull (optional)')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      
      const { loadAuth, loadConfig } = await import('../utils/config.js');
      const auth = await loadAuth(projectRoot);
      const config = await loadConfig(projectRoot);
      
      if (!auth || !config) {
        console.error('✗ Not initialized. Run `sprint-artifact init` first.');
        process.exit(1);
      }

      const { GoogleDriveClient } = await import('../sdk/google-drive.js');
      const driveClient = new GoogleDriveClient(auth);

      // Get year folder
      const yearFolders = await driveClient.listFiles(config.googleDrive.folderId);
      const yearFolder = yearFolders.find(f => f.name === config.googleDrive.year && f.mimeType === 'application/vnd.google-apps.folder');
      
      if (!yearFolder) {
        console.error(`✗ Year folder "${config.googleDrive.year}" not found.`);
        process.exit(1);
      }

      // Get folders inside year folder
      const subFolders = await driveClient.listFiles(yearFolder.id);
      const folders = subFolders.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      let sourceFolderId: string;
      let sourceFolderName: string;
      let targetSubDir: string;

      if (options.backlog) {
        const backlogsFolder = folders.find(f => f.name === 'Backlogs');
        if (!backlogsFolder) {
          console.error('✗ Backlogs folder not found.');
          process.exit(1);
        }
        sourceFolderId = backlogsFolder.id;
        sourceFolderName = 'Backlogs';
        targetSubDir = 'backlogs';
      } else if (options.sprint) {
        const sprintFolder = folders.find(f => f.name === options.sprint);
        if (!sprintFolder) {
          console.error(`✗ Sprint folder "${options.sprint}" not found.`);
          process.exit(1);
        }
        sourceFolderId = sprintFolder.id;
        sourceFolderName = options.sprint;
        targetSubDir = 'sprints';
      } else {
        // Let user select folder
        const selected = await select({
          message: 'Select source folder:',
          choices: folders.map(f => ({ name: f.name, value: f.id })),
        });
        sourceFolderId = selected;
        sourceFolderName = folders.find(f => f.id === selected)?.name || '';
        targetSubDir = sourceFolderName.toLowerCase().includes('sprint') ? 'sprints' : 'backlogs';
      }

      // Get tasks from source folder
      const tasks = await driveClient.listFiles(sourceFolderId);
      const taskFolders = tasks.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      if (taskFolders.length === 0) {
        console.error('✗ No tasks found.');
        process.exit(1);
      }

      let selectedTaskId: string;
      let selectedTaskName: string;

      if (options.taskId) {
        const task = taskFolders.find(f => f.name.startsWith(options.taskId));
        if (!task) {
          console.error(`✗ Task "${options.taskId}" not found.`);
          process.exit(1);
        }
        selectedTaskId = task.id;
        selectedTaskName = task.name;
      } else {
        const selected = await select({
          message: 'Select task to pull:',
          choices: taskFolders.map(f => ({ name: f.name, value: f.id })),
        });
        selectedTaskId = selected;
        selectedTaskName = taskFolders.find(f => f.id === selected)?.name || '';
      }

      // Pull task
      const targetPath = join(projectRoot, '.sprint-artifact', targetSubDir);
      await artifact.pullTask(selectedTaskId, selectedTaskName, targetPath);
      console.log(`✓ Pulled: ${selectedTaskName}`);
      console.log(`  Location: .sprint-artifact/${targetSubDir}/${selectedTaskName}/`);
    } catch (error) {
      console.error('✗ Failed to pull:', error);
      process.exit(1);
    }
  });

const sprintCmd = program
  .command('sprint')
  .description('Manage sprints');

sprintCmd
  .command('move')
  .description('Move a task to a different folder')
  .action(async () => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      
      const { loadAuth, loadConfig } = await import('../utils/config.js');
      const auth = await loadAuth(projectRoot);
      const config = await loadConfig(projectRoot);
      
      if (!auth || !config) {
        console.error('✗ Not initialized. Run `sprint-artifact init` first.');
        process.exit(1);
      }

      const { GoogleDriveClient } = await import('../sdk/google-drive.js');
      const driveClient = new GoogleDriveClient(auth);

      // Get year folder
      const yearFolders = await driveClient.listFiles(config.googleDrive.folderId);
      const yearFolder = yearFolders.find(f => f.name === config.googleDrive.year && f.mimeType === 'application/vnd.google-apps.folder');
      
      if (!yearFolder) {
        console.error(`✗ Year folder "${config.googleDrive.year}" not found.`);
        process.exit(1);
      }

      // Get folders inside year folder (Backlogs, Sprint 1, etc.)
      const subFolders = await driveClient.listFiles(yearFolder.id);
      const folders = subFolders.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      if (folders.length === 0) {
        console.error('✗ No folders found.');
        process.exit(1);
      }

      // Step 1: Select source folder
      const sourceFolderId = await select({
        message: 'Select source folder:',
        choices: folders.map(f => ({ name: f.name, value: f.id })),
      });
      const sourceFolderName = folders.find(f => f.id === sourceFolderId)?.name || '';

      // Step 2: Get tasks from source folder
      const tasks = await driveClient.listFiles(sourceFolderId);
      const taskFolders = tasks.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      if (taskFolders.length === 0) {
        console.error('✗ No tasks found in folder.');
        process.exit(1);
      }

      // Step 3: Select task to move
      const selectedTaskId = await select({
        message: 'Select task to move:',
        choices: taskFolders.map(t => ({ name: t.name, value: t.id })),
      });
      const selectedTaskName = taskFolders.find(t => t.id === selectedTaskId)?.name || '';

      // Step 4: Select destination folder
      const destFolderId = await select({
        message: 'Move to:',
        choices: folders.filter(f => f.id !== sourceFolderId).map(f => ({ name: f.name, value: f.id })),
      });
      const destFolderName = folders.find(f => f.id === destFolderId)?.name || '';

      // Move task
      await artifact.moveToSprint(selectedTaskId, destFolderId);
      
      console.log(`✓ Moved: ${selectedTaskName}`);
      console.log(`  From: ${sourceFolderName}`);
      console.log(`  To: ${destFolderName}`);
    } catch (error) {
      console.error('✗ Failed to move:', error);
      process.exit(1);
    }
  });

program.parse();
