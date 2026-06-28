#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SprintArtifact } from '../sdk/index.js';
import { resolve } from 'node:path';
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
  taskType: z.enum(['backlogs', 'sprints']).optional(),
});

const SyncSchema = z.object({});

const StatusSchema = z.object({});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
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
        name: 'status',
        description: 'Get current project status',
        inputSchema: {
          type: 'object',
          properties: {},
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
            taskType: { type: 'string', enum: ['backlogs', 'sprints'], description: 'Task type (default: backlogs)' },
          },
          required: ['taskName', 'taskId'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'backlog_create': {
        const { id, title, folderId } = BacklogCreateSchema.parse(args);
        const config = await artifact.getConfig();
        const targetFolderId = folderId || config?.googleDrive.defaultFolderId;
        if (!targetFolderId) {
          throw new Error('No folderId provided and no default folder configured. Run `sprint-artifact init` first.');
        }
        await artifact.createBacklog(id, title, targetFolderId);
        return {
          content: [
            {
              type: 'text',
              text: `Created and selected backlog item: ${id} ${title}. Synced to .sprint-artifact/backlogs/${id} ${title}/`,
            },
          ],
        };
      }

      case 'sync_documents': {
        SyncSchema.parse(args);
        const result = await artifact.sync();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'move_to_sprint': {
        const { taskFolderId, newParentFolderId, taskName } = MoveToSprintSchema.parse(args);
        await artifact.moveToSprint(taskFolderId, newParentFolderId, taskName);
        return {
          content: [
            {
              type: 'text',
              text: `Moved task ${taskFolderId} to folder ${newParentFolderId}. Local folder moved to .sprint-artifact/sprints/.`,
            },
          ],
        };
      }

      case 'status': {
        StatusSchema.parse(args);
        const status = await artifact.status();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      }

      case 'select_task': {
        const { taskName, taskId, taskType } = SelectTaskSchema.parse(args);
        await artifact.selectTask(taskName, taskId, taskId, taskType);
        return {
          content: [
            {
              type: 'text',
              text: `Selected task: ${taskName}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
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
