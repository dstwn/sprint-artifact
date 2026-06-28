#!/usr/bin/env node

import { Command } from 'commander';
import { SprintArtifact } from '../sdk/index.js';
import { resolve } from 'node:path';
import { login } from '../utils/oauth2.js';
import { saveAuth } from '../utils/config.js';
import { select } from '@inquirer/prompts';

const program = new Command();

program
  .name('sprint-artifact')
  .description('Sprint Artifact management tool with Google Drive integration')
  .version('0.1.0');

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
  .requiredOption('--folder-id <id>', 'Google Drive folder ID')
  .option('--year <year>', 'Year folder (e.g., 2026)')
  .option('--auth <path>', 'Path to auth JSON file')
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

      // Get year folders from Google Drive
      const { GoogleDriveClient } = await import('../sdk/google-drive.js');
      const driveClient = new GoogleDriveClient(auth);
      const folders = await driveClient.listFiles(options.folderId);
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

      await artifact.init(options.folderId, year, defaultFolderId);
      console.log('✓ Sprint Artifact project initialized');
      console.log(`  Folder ID: ${options.folderId}`);
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
  .command('select')
  .description('Select a task to work on')
  .argument('<task-id>', 'Task ID to select')
  .action(async (taskId) => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      await artifact.selectTask(taskId);
      console.log(`✓ Selected task: ${taskId}`);
    } catch (error) {
      console.error('✗ Failed to select task:', error);
      process.exit(1);
    }
  });

const sprintCmd = program
  .command('sprint')
  .description('Manage sprints');

sprintCmd
  .command('move')
  .description('Move a backlog item to a sprint')
  .requiredOption('--backlog-id <id>', 'Backlog item ID')
  .requiredOption('--sprint-id <id>', 'Sprint ID')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      await artifact.moveToSprint(options.backlogId, options.sprintId);
      console.log(`✓ Moved backlog item ${options.backlogId} to sprint ${options.sprintId}`);
    } catch (error) {
      console.error('✗ Failed to move item:', error);
      process.exit(1);
    }
  });

program.parse();
