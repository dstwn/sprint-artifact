import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { EOL, homedir } from 'node:os';

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

interface SkillSpec {
  description: string;
  body: string;
}

const SKILL_SPECS: Record<string, SkillSpec> = {
  'sprint-artifact': {
    description: 'Manage sprint artifacts (backlogs, tasks, documents) with Google Drive. Overview of all commands and MCP tools.',
    body: `Manage sprint artifacts (backlogs, tasks, documents) with Google Drive integration.

## Available Commands

|\`/sprint-artifact-init\`|Initialize project config|
|\`/sprint-artifact-select\`|Browse folders, pick task, auto-pull to local|
|\`/sprint-artifact-backlog-create\`|Create backlog with 5-subfolder structure|
|\`/sprint-artifact-pull\`|Pull task files from Drive to local|
|\`/sprint-artifact-push\`|Push .planning/ files to active task in Drive|
|\`/sprint-artifact-sync\`|Bidirectional sync for active task|
|\`/sprint-artifact-move\`|Move task between Backlogs and Sprint folders|
|\`/sprint-artifact-status\`|Show project config and active task|

## MCP Tools

|\`list_folders\`|List year folders or subfolders|
|\`list_tasks\`|List tasks in a folder|
|\`init_project\`|Initialize project config|
|\`backlog_create\`|Create backlog with subfolder structure|
|\`select_task\`|Select active task and auto-pull|
|\`pull_task\`|Pull task from Drive to local|
|\`push_files\`|Push .planning/ to active task|
|\`sync_documents\`|Bidirectional sync|
|\`move_to_sprint\`|Move task folder between Backlogs/Sprints|
|\`status\`|Show config and active task|

## Folder Structure

\`\`\`
SprintArtifacts/ → YYYY/ → Backlogs|Sprints/ → ID-Title/ → 01..05 subfolders
\`\`\`

Local workspace: \`.sprint-artifact/backlogs|sprints/<task>/\`
Push source: \`.planning/\``,
  },
  'sprint-artifact-init': {
    description: 'Initialize Sprint Artifact project config (folder ID, year, default backlog folder).',
    body: `Initialize Sprint Artifact project configuration.

## Steps

1. Call \`init_project\` with \`folderId\` (root SprintArtifacts Drive folder ID)
2. Optional: \`year\` (default: current year)
3. Optional: \`defaultFolderId\` (default backlog folder)

Config is saved to \`.sprint-artifact/config.json\`.`,
  },
  'sprint-artifact-select': {
    description: 'Browse Google Drive folders and select an active task. Auto-pulls to local workspace.',
    body: `Browse and select a task to work on. Auto-pulls to local.

## Steps

1. Call \`list_folders\` to browse year folders and subfolders
2. Call \`list_tasks\` with chosen folderId to list tasks
3. Call \`select_task\` with taskName, taskId, taskType (backlogs|sprints)

Task is auto-pulled to \`.sprint-artifact/<type>/<task>/\`.`,
  },
  'sprint-artifact-backlog-create': {
    description: 'Create a backlog item with standardized 5-subfolder structure in Google Drive. Auto-selects and auto-pulls.',
    body: `Create a new backlog item with standardized folder structure. Auto-selects and auto-pulls.

## Steps

1. Call \`backlog_create\` with \`id\` (e.g. "IDS-123") and \`title\`
2. Optional: \`folderId\` (uses default from config if omitted)

Creates folder structure in Drive:
- 01. Business Requirement Documents
- 02. Technical Documents
- 03. Testing Documents
- 04. User Acceptance Test Documents
- 05. Guide Documents

Task is auto-selected and pulled to \`.sprint-artifact/backlogs/<id> <title>/\`.`,
  },
  'sprint-artifact-pull': {
    description: 'Pull task files from Google Drive to local workspace.',
    body: `Download task files from Google Drive to local.

## Steps

1. Call \`list_folders\` to browse to find the task
2. Call \`list_tasks\` to list tasks in chosen folder
3. Call \`pull_task\` with taskId, taskName, taskType (backlogs|sprints)

Files downloaded to \`.sprint-artifact/<type>/<task>/\`.`,
  },
  'sprint-artifact-push': {
    description: 'Push .planning/ files to active task in Google Drive. Auto-syncs after push.',
    body: `Upload .planning/ files to active task in Google Drive. Auto-syncs after push.

## Steps

1. Ensure active task is selected (call select_task first)
2. Call \`push_files\` with optional subfolder:
   - "01. Business Requirement Documents"
   - "02. Technical Documents"
   - "03. Testing Documents"
   - "04. User Acceptance Test Documents"
   - "05. Guide Documents"
   - Omit for interactive selection

Auto-syncs after push.`,
  },
  'sprint-artifact-sync': {
    description: 'Bidirectional sync for active task: pull remote files, upload local new files.',
    body: `Bidirectional sync for active task: pull remote files, upload local new files.

## Steps

1. Ensure active task is selected
2. Call \`sync_documents\` — no params needed

Result shows added/updated/deleted counts.`,
  },
  'sprint-artifact-move': {
    description: 'Move a task folder between Backlogs and Sprint folders. Local folder moves automatically.',
    body: `Move a task folder between Backlogs and Sprint folders. Local folder moves automatically.

## Steps

1. Call \`list_folders\` to browse source folder
2. Call \`list_tasks\` to list tasks in the source folder
3. Call \`move_to_sprint\` with taskFolderId, newParentFolderId
   - Optional: taskName (for local folder rename)

Local folder moves from \`.sprint-artifact/backlogs/\` to \`.sprint-artifact/sprints/\`.`,
  },
  'sprint-artifact-status': {
    description: 'Show current project configuration and active task details.',
    body: `Show current project configuration and active task details.

## Steps

1. Call \`status\` — no params needed

Returns: rootFolderId, year, selectedTask, lastSync, fileCount, etc.`,
  },
};

const SKILL_DIRS: Record<string, string> = {
  cursor: '.cursor/skills',
  claude: '.claude/skills',
  opencode: '.opencode/skills',
};

function buildSkillYaml(name: string, description: string, extra: Record<string, unknown> = {}): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${name}`);
  lines.push(`description: "${description.replace(/"/g, '\\"')}"`);
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === 'boolean') {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

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

function installSkillsTo(baseDir: string, disableModelInvocation: boolean): void {
  for (const [name, spec] of Object.entries(SKILL_SPECS)) {
    const extra: Record<string, unknown> = {};
    if (disableModelInvocation) {
      extra['disable-model-invocation'] = true;
    }
    const yaml = buildSkillYaml(name, spec.description, extra);
    const dir = join(baseDir, name);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(dir, 'SKILL.md'), yaml + '\n\n' + spec.body + '\n');
  }
}

export async function install(projectRoot: string, assistant?: string): Promise<void> {
  const allAssistants: Assistant[] = ['cursor', 'opencode', 'claude', 'copilot', 'skill'];
  const assistants: Assistant[] = assistant
    ? assistant === 'all'
      ? allAssistants
      : [assistant as Assistant]
    : allAssistants;

  for (const name of assistants) {
    switch (name) {
      case 'opencode':
        installMcpConfig(projectRoot, 'opencode');
        installSkillsTo(join(projectRoot, '.opencode', 'skills'), false);
        installSkillsTo(join(homedir(), '.agents', 'skills'), false);
        console.log('  → .opencode/skills/<command>/SKILL.md + ~/.agents/skills/<command>/SKILL.md');
        break;
      case 'cursor':
        installMcpConfig(projectRoot, 'cursor');
        installSkillsTo(join(projectRoot, '.cursor', 'skills'), true);
        console.log('  → .cursor/skills/<command>/SKILL.md');
        break;
      case 'claude':
        installMcpConfig(projectRoot, 'claude');
        installSkillsTo(join(projectRoot, '.claude', 'skills'), false);
        console.log('  → .claude/skills/<command>/SKILL.md');
        break;
      case 'copilot':
        installMcpConfig(projectRoot, 'copilot');
        break;
      case 'skill':
        installSkillsTo(join(projectRoot, '.sprint-artifact', 'skills'), false);
        console.log('  → .sprint-artifact/skills/<command>/SKILL.md');
        break;
    }
  }

  console.log('');
  console.log('Next steps:');
  if (assistants.includes('cursor')) console.log('  - Cursor: Type /<command> (e.g. /sprint-artifact-select) in Agent chat, or restart Cursor');
  if (assistants.includes('claude')) console.log('  - Claude Code: Run `claude mcp list` to verify connection');
  if (assistants.includes('opencode')) console.log('  - OpenCode: Restart session');
  if (assistants.includes('copilot')) console.log('  - Copilot: Restart VS Code to load MCP server');
  if (assistants.includes('skill')) console.log('  - Reference .sprint-artifact/skills/<command>/');
}
