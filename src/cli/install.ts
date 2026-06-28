import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { EOL } from 'node:os';

type Assistant = 'cursor' | 'opencode' | 'claude' | 'copilot' | 'skill';

const MCP_CONFIGS: Record<Exclude<Assistant, 'skill'>, {
  path: string;
  config: Record<string, unknown>;
  description: string;
  merge: boolean;
}> = {
  cursor: {
    path: '.cursor/mcp.json',
    description: 'Cursor MCP configuration',
    merge: true,
    config: {
      mcpServers: {
        'sprint-artifact': {
          command: 'sprint-artifact',
          args: ['mcp'],
        },
      },
    },
  },
  opencode: {
    path: 'opencode.json',
    description: 'OpenCode MCP configuration',
    merge: true,
    config: {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        'sprint-artifact': {
          type: 'local',
          command: ['sprint-artifact', 'mcp'],
          enabled: true,
        },
      },
    },
  },
  claude: {
    path: '.mcp.json',
    description: 'Claude Code MCP configuration',
    merge: true,
    config: {
      mcpServers: {
        'sprint-artifact': {
          command: 'sprint-artifact',
          args: ['mcp'],
        },
      },
    },
  },
  copilot: {
    path: '.vscode/mcp.json',
    description: 'GitHub Copilot (VS Code) MCP configuration',
    merge: true,
    config: {
      mcpServers: {
        'sprint-artifact': {
          command: 'sprint-artifact',
          args: ['mcp'],
        },
      },
    },
  },
};

const COMMAND_SKILLS: Record<string, string> = {
  'sprint-artifact': `# Sprint Artifact — AI Assistant Integration

Manage sprint artifacts (backlogs, tasks, documents) with Google Drive.

## Quick Reference
- /sprint-artifact-init — Init project
- /sprint-artifact-select — Select active task
- /sprint-artifact-backlog-create — Create backlog
- /sprint-artifact-pull — Pull task from Drive
- /sprint-artifact-push — Push .planning/ to Drive
- /sprint-artifact-sync — Bidirectional sync
- /sprint-artifact-move — Move task to sprint
- /sprint-artifact-status — Project status

## MCP Tools Available
list_folders, list_tasks, init_project, backlog_create, select_task, pull_task, push_files, sync_documents, move_to_sprint, status

## Folder Structure
SprintArtifacts/ → 2026/ → Backlogs|Sprints/ → IDS-xxx Title/ → 01..05 subfolders
Local: .sprint-artifact/backlogs|sprints/<task>/
Push source: .planning/
`,

  'sprint-artifact-init': `# /sprint-artifact-init — Initialize Project

Sets up Sprint Artifact config for this project.

## Steps
1. \`init_project\` — Call with folderId (root SprintArtifacts Drive folder)
   - Optional: year (default: current year)
   - Optional: defaultFolderId (default backlog folder)
2. Config saved to .sprint-artifact/config.json
`,

  'sprint-artifact-select': `# /sprint-artifact-select — Select Active Task

Browse and select a task to work on. Auto-pulls to local.

## Steps
1. \`list_folders\` — Browse year folders and subfolders
2. \`list_tasks\` — List tasks in chosen folder
3. \`select_task\` — Call with taskName, taskId, taskType
4. Task is auto-pulled to .sprint-artifact/<type>/<task>/
`,

  'sprint-artifact-backlog-create': `# /sprint-artifact-backlog-create — Create Backlog

Create a new backlog item with standardized folder structure. Auto-selects and auto-pulls.

## Steps
1. \`backlog_create\` — Call with id (e.g. "IDS-123"), title
   - folderId is optional (uses default from config)
2. Folder structure created in Drive:
   - 01. Business Requirement Documents
   - 02. Technical Documents
   - 03. Testing Documents
   - 04. User Acceptance Test Documents
   - 05. Guide Documents
3. Task auto-selected, pulled to .sprint-artifact/backlogs/<id> <title>/
`,

  'sprint-artifact-pull': `# /sprint-artifact-pull — Pull Task

Download task files from Google Drive to local.

## Steps
1. \`list_folders\` — Browse to find the task
2. \`list_tasks\` — List tasks in folder
3. \`pull_task\` — Call with taskId, taskName, taskType (backlogs|sprints)
4. Files downloaded to .sprint-artifact/<type>/<task>/
`,

  'sprint-artifact-push': `# /sprint-artifact-push — Push Files

Upload .planning/ files to active task in Google Drive. Auto-syncs after push.

## Steps
1. Ensure active task is selected (select_task first)
2. \`push_files\` — Call with optional subfolder:
   - "01. Business Requirement Documents"
   - "02. Technical Documents" (use —tech-docs)
   - "03. Testing Documents"
   - "04. User Acceptance Test Documents"
   - "05. Guide Documents"
   - Omit for interactive selection
3. Auto-syncs after push
`,

  'sprint-artifact-sync': `# /sprint-artifact-sync — Sync Documents

Bidirectional sync for active task: pull remote files, upload local new files.

## Steps
1. Ensure active task is selected
2. \`sync_documents\` — No params needed
3. Result shows added/updated/deleted counts
`,

  'sprint-artifact-move': `# /sprint-artifact-move — Move Task to Sprint

Move a task folder between Backlogs and Sprint folders. Local folder moves automatically.

## Steps
1. \`list_folders\` — Browse to find source folder
2. \`list_tasks\` — List tasks in source folder
3. \`move_to_sprint\` — Call with taskFolderId, newParentFolderId
   - Optional: taskName (for local folder move)
4. Local folder moves from .sprint-artifact/backlogs/ to sprints/
`,

  'sprint-artifact-status': `# /sprint-artifact-status — Project Status

Show current project configuration and active task details.

## Steps
1. \`status\` — No params needed
2. Returns: rootFolderId, year, selectedTask, lastSync, fileCount, etc.
`,
};

const ASSISTANT_SKILL_DIRS: Record<string, string> = {
  cursor: '.cursor/rules/sprint-artifact',
  opencode: '.opencode/skills/sprint-artifact',
  claude: '.claude/skills/sprint-artifact',
};

function mergeConfig(existing: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(update)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof merged[key] === 'object' && merged[key] !== null && !Array.isArray(merged[key])) {
      merged[key] = { ...(merged[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function installMcpConfig(projectRoot: string, name: Assistant): void {
  const cfg = (MCP_CONFIGS as Record<string, typeof MCP_CONFIGS['cursor'] | undefined>)[name];
  if (!cfg) return;
  const fullPath = join(projectRoot, cfg.path);
  const dir = dirname(fullPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let finalConfig: Record<string, unknown>;
  if (cfg.merge && existsSync(fullPath)) {
    try {
      const existing = JSON.parse(readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
      finalConfig = mergeConfig(existing, cfg.config);
      console.log(`  Merged with existing: ${cfg.path}`);
    } catch {
      finalConfig = cfg.config;
    }
  } else {
    finalConfig = cfg.config;
  }

  writeFileSync(fullPath, JSON.stringify(finalConfig, null, 2) + EOL);
  console.log(`✓ Created: ${cfg.path}  (${cfg.description})`);
}

function installSkills(projectRoot: string, targetDir: string, label: string): void {
  const dir = join(projectRoot, targetDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  for (const [name, content] of Object.entries(COMMAND_SKILLS)) {
    const skillFile = `${name}.md`;
    const fullPath = join(dir, skillFile);
    writeFileSync(fullPath, content);
  }
  console.log(`✓ Skills injected (${Object.keys(COMMAND_SKILLS).length} files): ${targetDir}/`);
}

export async function install(projectRoot: string, assistant?: string): Promise<void> {
  const allAssistants: Assistant[] = ['cursor', 'opencode', 'claude', 'copilot', 'skill'];
  const assistants: Assistant[] = assistant
    ? assistant === 'all'
      ? allAssistants
      : [assistant as Assistant]
    : allAssistants;

  for (const name of assistants) {
    if (name === 'skill') {
      installSkills(projectRoot, '.sprint-artifact/skills/sprint-artifact', 'canonical');
      continue;
    }

    installMcpConfig(projectRoot, name);

    if (name in ASSISTANT_SKILL_DIRS) {
      installSkills(projectRoot, (ASSISTANT_SKILL_DIRS as Record<string, string>)[name], name);
    }
  }

  console.log('');
  console.log('Next steps:');
  if (assistants.includes('cursor')) console.log('  - Cursor: Restart Cursor or run Cmd+Shift+P > Reload Window');
  if (assistants.includes('claude')) console.log('  - Claude Code: Run `claude mcp list` to verify connection');
  if (assistants.includes('opencode')) console.log('  - OpenCode: Skills loaded at .opencode/skills/sprint-artifact/');
  if (assistants.includes('copilot')) console.log('  - Copilot: Restart VS Code to load MCP server');
  if (assistants.includes('skill')) console.log('  - AI assistant: Reference .sprint-artifact/skills/sprint-artifact/');
}
