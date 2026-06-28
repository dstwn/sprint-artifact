#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SprintArtifact } from '../sdk/index.js';
import { resolve, join } from 'node:path';
import { z } from 'zod';

const server = new Server(
  {
    name: 'sprint-artifact',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const projectRoot = resolve(process.cwd());
const artifact = new SprintArtifact(projectRoot);

const BacklogCreateSchema = z.object({
  id: z.string(),
  title: z.string(),
  folderId: z.string().optional(),
});

const MoveToSprintSchema = z.object({
  taskFolderId: z.string(),
  newParentFolderId: z.string(),
  taskName: z.string().optional(),
});

const SelectTaskSchema = z.object({
  taskName: z.string(),
  taskId: z.string(),
  folderId: z.string().optional(),
  taskType: z.enum(['backlogs', 'sprints']).optional(),
});

const PullTaskSchema = z.object({
  taskId: z.string(),
  taskName: z.string(),
  taskType: z.enum(['backlogs', 'sprints']).optional(),
});

const PushFilesSchema = z.object({
  subfolder: z.enum(['01. Business Requirement Documents', '02. Technical Documents', '03. Testing Documents', '04. User Acceptance Test Documents', '05. Guide Documents']).optional(),
});

const InitProjectSchema = z.object({
  folderId: z.string(),
  year: z.string().optional(),
  defaultFolderId: z.string().optional(),
});

const ListFoldersSchema = z.object({});

const ListTasksSchema = z.object({
  folderId: z.string(),
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_folders',
        description: 'List year folders and their subfolders (Backlogs, Sprints) from Google Drive',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_tasks',
        description: 'List tasks in a specific folder',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: { type: 'string', description: 'Folder ID to list tasks from' },
          },
          required: ['folderId'],
        },
      },
      {
        name: 'backlog_create',
        description: 'Create a new backlog item in Google Drive (auto-selects + auto-pulls to local)',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Task ID (e.g., IDS-123)' },
            title: { type: 'string', description: 'Task title' },
            folderId: { type: 'string', description: 'Google Drive folder ID (optional, uses default from config)' },
          },
          required: ['id', 'title'],
        },
      },
      {
        name: 'select_task',
        description: 'Select a task to work on (auto-pulls to local)',
        inputSchema: {
          type: 'object',
          properties: {
            taskName: { type: 'string', description: 'Task display name (e.g., "IDS-123 Fix login bug")' },
            taskId: { type: 'string', description: 'Task folder ID' },
            folderId: { type: 'string', description: 'Parent folder ID (optional, uses taskId if not provided)' },
            taskType: { type: 'string', enum: ['backlogs', 'sprints'], description: 'Task type (default: backlogs)' },
          },
          required: ['taskName', 'taskId'],
        },
      },
      {
        name: 'pull_task',
        description: 'Pull a task from Google Drive to local',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task folder ID' },
            taskName: { type: 'string', description: 'Task display name' },
            taskType: { type: 'string', enum: ['backlogs', 'sprints'], description: 'Task type (default: backlogs)' },
          },
          required: ['taskId', 'taskName'],
        },
      },
      {
        name: 'push_files',
        description: 'Push local files (.planning) to Google Drive (auto sync after push)',
        inputSchema: {
          type: 'object',
          properties: {
            subfolder: { type: 'string', enum: ['01. Business Requirement Documents', '02. Technical Documents', '03. Testing Documents', '04. User Acceptance Test Documents', '05. Guide Documents'], description: 'Target subfolder (optional, interactive if not provided)' },
          },
        },
      },
      {
        name: 'sync_documents',
        description: 'Sync documents between local and Google Drive for the active task (pull remote + upload local new files)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'move_to_sprint',
        description: 'Move a task folder to a different parent folder (local folder moves too)',
        inputSchema: {
          type: 'object',
          properties: {
            taskFolderId: { type: 'string', description: 'Task folder ID' },
            newParentFolderId: { type: 'string', description: 'New parent folder ID' },
            taskName: { type: 'string', description: 'Task folder name (optional, for local folder move)' },
          },
          required: ['taskFolderId', 'newParentFolderId'],
        },
      },
      {
        name: 'init_project',
        description: 'Initialize a new Sprint Artifact project',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: { type: 'string', description: 'Google Drive folder ID (root SprintArtifacts folder)' },
            year: { type: 'string', description: 'Year folder (e.g., "2026", optional)' },
            defaultFolderId: { type: 'string', description: 'Default backlog folder ID (optional)' },
          },
          required: ['folderId'],
        },
      },
      {
        name: 'status',
        description: 'Get current project status',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

async function getDriveClient() {
  const { loadAuth } = await import('../utils/config.js');
  const { GoogleDriveClient } = await import('../sdk/google-drive.js');
  const auth = await loadAuth(projectRoot);
  if (!auth) throw new Error('Not logged in. Run `sprint-artifact login` first.');
  return new GoogleDriveClient(auth);
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_folders': {
        const drive = await getDriveClient();
        const config = await artifact.getConfig();
        const rootId = config?.googleDrive.folderId;
        if (!rootId) throw new Error('Not initialized. Run init_project first.');

        const yearFolders = await drive.listFiles(rootId);
        const years = yearFolders.filter(f => f.mimeType === 'application/vnd.google-apps.folder' && /^\d{4}$/.test(f.name));

        const result: Record<string, { id: string; folders: { id: string; name: string }[] }> = {};
        for (const year of years) {
          const subfolders = await drive.listFiles(year.id);
          result[year.name] = {
            id: year.id,
            folders: subfolders.filter(f => f.mimeType === 'application/vnd.google-apps.folder').map(f => ({ id: f.id, name: f.name })),
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list_tasks': {
        const { folderId } = ListTasksSchema.parse(args);
        const drive = await getDriveClient();
        const items = await drive.listFiles(folderId);
        const tasks = items.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
        return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
      }

      case 'init_project': {
        const { folderId, year, defaultFolderId } = InitProjectSchema.parse(args);
        const config = await artifact.getConfig();
        const configYear = year || config?.googleDrive.year || new Date().getFullYear().toString();
        await artifact.init(folderId, configYear, defaultFolderId);
        return { content: [{ type: 'text', text: `Project initialized. Folder: ${folderId}, Year: ${configYear}` }] };
      }

      case 'backlog_create': {
        const { id, title, folderId } = BacklogCreateSchema.parse(args);
        const config = await artifact.getConfig();
        const targetFolderId = folderId || config?.googleDrive.defaultFolderId;
        if (!targetFolderId) {
          throw new Error('No folderId provided and no default folder configured. Run init_project first.');
        }
        await artifact.createBacklog(id, title, targetFolderId);
        return {
          content: [{ type: 'text', text: `Created and selected backlog item: ${id} ${title}. Synced to .sprint-artifact/backlogs/${id} ${title}/` }],
        };
      }

      case 'select_task': {
        const { taskName, taskId, folderId, taskType } = SelectTaskSchema.parse(args);
        const parentFolderId = folderId || taskId;
        await artifact.selectTask(taskName, taskId, parentFolderId, taskType);
        const ttype = taskType || 'backlogs';
        const targetPath = join(projectRoot, '.sprint-artifact', ttype);
        await artifact.pullTask(taskId, taskName, targetPath);
        return { content: [{ type: 'text', text: `Selected task: ${taskName}. Pulled to .sprint-artifact/${ttype}/${taskName}/` }] };
      }

      case 'pull_task': {
        const { taskId, taskName, taskType } = PullTaskSchema.parse(args);
        const ttype = taskType || 'backlogs';
        const targetPath = join(projectRoot, '.sprint-artifact', ttype);
        await artifact.pullTask(taskId, taskName, targetPath);
        return { content: [{ type: 'text', text: `Pulled: ${taskName} to .sprint-artifact/${ttype}/${taskName}/` }] };
      }

      case 'push_files': {
        const { subfolder } = PushFilesSchema.parse(args);
        const config = await artifact.getConfig();
        if (!config?.selectedTaskId) throw new Error('No active task. Run select_task first.');

        const drive = await getDriveClient();
        const subfolders = await drive.listFiles(config.selectedTaskId);
        const folders = subfolders.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

        let targetFolderId: string;
        if (subfolder) {
          const found = folders.find(f => f.name === subfolder);
          if (!found) throw new Error(`Subfolder "${subfolder}" not found in task.`);
          targetFolderId = found.id;
        } else {
          const available = folders.map(f => f.name).join(', ');
          throw new Error(`No subfolder specified. Available: ${available}`);
        }

        await artifact.pushToFolder(targetFolderId);
        await artifact.sync();
        return { content: [{ type: 'text', text: `Pushed to task folder. Synced.` }] };
      }

      case 'sync_documents': {
        const result = await artifact.sync();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'move_to_sprint': {
        const { taskFolderId, newParentFolderId, taskName } = MoveToSprintSchema.parse(args);
        await artifact.moveToSprint(taskFolderId, newParentFolderId, taskName);
        return { content: [{ type: 'text', text: `Moved task. Local folder moved to .sprint-artifact/sprints/.` }] };
      }

      case 'status': {
        const status = await artifact.status();
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

export async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sprint Artifact MCP server running on stdio');
}

const isDirectRun = process.argv[1]?.endsWith('mcp/index.js') || process.argv[1]?.endsWith('mcp/index');
if (isDirectRun) {
  main().catch(console.error);
}
