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
  folderId: z.string(),
});

const SyncSchema = z.object({});

const MoveToSprintSchema = z.object({
  backlogId: z.string(),
  sprintId: z.string(),
});

const StatusSchema = z.object({});

const SelectTaskSchema = z.object({
  taskId: z.string(),
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'backlog_create',
        description: 'Create a new backlog item in Google Drive',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Task ID (e.g., IDS-123)' },
            title: { type: 'string', description: 'Task title' },
            folderId: { type: 'string', description: 'Google Drive folder ID' },
          },
          required: ['id', 'title', 'folderId'],
        },
      },
      {
        name: 'sync_documents',
        description: 'Sync documents between local and Google Drive',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'move_to_sprint',
        description: 'Move a backlog item to a sprint',
        inputSchema: {
          type: 'object',
          properties: {
            backlogId: { type: 'string', description: 'Backlog item ID' },
            sprintId: { type: 'string', description: 'Sprint ID' },
          },
          required: ['backlogId', 'sprintId'],
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
        description: 'Select a task to work on',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to select' },
          },
          required: ['taskId'],
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
        await artifact.createBacklog(id, title, folderId);
        return {
          content: [
            {
              type: 'text',
              text: `Created backlog item: ${id} ${title}`,
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
        const { backlogId, sprintId } = MoveToSprintSchema.parse(args);
        await artifact.moveToSprint(backlogId, sprintId);
        return {
          content: [
            {
              type: 'text',
              text: `Moved backlog item ${backlogId} to sprint ${sprintId}`,
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
        const { taskId } = SelectTaskSchema.parse(args);
        await artifact.selectTask(taskId);
        return {
          content: [
            {
              type: 'text',
              text: `Selected task: ${taskId}`,
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sprint Artifact MCP server running on stdio');
}

main().catch(console.error);
