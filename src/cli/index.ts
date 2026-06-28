#!/usr/bin/env node

import { Command } from 'commander';
import { SprintArtifact } from '../sdk/index.js';
import { resolve } from 'node:path';
import { login } from '../utils/oauth2.js';
import { saveAuth } from '../utils/config.js';

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
  .option('--auth <path>', 'Path to auth JSON file')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      await artifact.init(options.folderId);
      console.log('✓ Sprint Artifact project initialized');
      console.log(`  Folder ID: ${options.folderId}`);
      console.log('  Config: .sprint-artifact/config.json');
      if (options.auth) {
        console.log(`  Auth: ${options.auth}`);
      }
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
  .requiredOption('--title <title>', 'Backlog item title')
  .option('--description <desc>', 'Backlog item description', '')
  .option('--priority <priority>', 'Priority (high, medium, low)', 'medium')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const artifact = new SprintArtifact(projectRoot);
      const item = await artifact.createBacklog(
        options.title,
        options.description,
        options.priority
      );
      console.log('✓ Backlog item created');
      console.log(`  ID: ${item.id}`);
      console.log(`  Title: ${item.title}`);
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
