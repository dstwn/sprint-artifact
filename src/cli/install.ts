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

const SKILL_CONTENT = `# Sprint Artifact — AI Assistant Workflow

## Overview
Sprint Artifact is a CLI/MCP/SDK tool for managing sprint artifacts (backlogs, tasks, documents) with Google Drive integration. It helps teams organize project documentation using a standardized folder structure.

## Available Commands

### Task Management
- \`sprint-artifact select\` — Browse and select a task interactively (auto-pulls to local)
- \`sprint-artifact backlog create [--id ID] [--title TITLE]\` — Create a new backlog task

### Push & Pull
- \`sprint-artifact pull [--backlog|--sprint <name>]\` — Pull task files from Google Drive
- \`sprint-artifact push [--tech-docs]\` — Push .planning/ files to Google Drive

### Sync & Status
- \`sprint-artifact sync\` — Bidirectional sync (pull remote + upload new local files) for active task
- \`sprint-artifact status\` — Show project status with detailed IDs

### Sprint Management
- \`sprint-artifact sprint move\` — Move a task between folders interactively

### MCP Server
- \`sprint-artifact mcp\` — Start MCP server for AI assistant integration

## MCP Tools (available via AI assistant)
| Tool | Description |
|------|-------------|
| \`list_folders\` | Browse year + subfolder structure |
| \`list_tasks\` | List tasks in a folder |
| \`init_project\` | Initialize project config |
| \`backlog_create\` | Create backlog + auto-select + auto-pull |
| \`select_task\` | Select active task |
| \`pull_task\` | Pull task from Google Drive |
| \`push_files\` | Push .planning/ to active task |
| \`sync_documents\` | Bidirectional sync from active task |
| \`move_to_sprint\` | Move task + local folder |
| \`status\` | Show project status |

## Google Drive Folder Structure
\`\`\`
SprintArtifacts/ (Shared Drive)
├── 2026/
│   ├── Backlogs/
│   │   ├── IDS-123 Task title/
│   │   │   ├── 01. Business Requirement Documents/
│   │   │   ├── 02. Technical Documents/
│   │   │   ├── 03. Testing Documents/
│   │   │   ├── 04. User Acceptance Test Documents/
│   │   │   └── 05. Guide Documents/
│   │   └── ...
│   ├── Sprint 1/
│   └── Sprint 2/
\`\`\`

## Local Structure
\`\`\`
.sprint-artifact/
├── config.json        # Project config (auto-generated)
├── auth.json          # OAuth2 tokens (DO NOT COMMIT)
├── backlogs/          # Pulled backlog tasks
│   └── IDS-123 Task title/
└── sprints/           # Pulled sprint tasks
    └── IDS-456 Another task/
.planning/             # Push source directory
.cursor/mcp.json       # MCP config (auto-installed)
opencode.json          # OpenCode config (auto-installed)
.mcp.json              # Claude Code config (auto-installed)
.vscode/mcp.json       # Copilot config (auto-installed)
\`\`\`

## Workflow

### Daily Flow
1. \`sprint-artifact select\` — Select active task (auto-pulls)
2. Edit files in \`.sprint-artifact/backlogs/<task>/\`
3. \`sprint-artifact push\` — Push changes to Google Drive
4. \`sprint-artifact sync\` — Sync changes from remote

### Create New Task
1. \`sprint-artifact backlog create\` — Creates folder structure, auto-selects, auto-pulls
2. Edit files
3. \`sprint-artifact push --tech-docs\` — Push technical docs
4. \`sprint-artifact sync\` — Sync

### Move Task to Sprint
1. \`sprint-artifact sprint move\` — Interactive move (local folder moves automatically)
2. \`sprint-artifact select\` — Re-select moved task
`;

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

const SKILL_PATHS: Record<string, string> = {
  cursor: '.cursor/rules/sprint-artifact/SKILL.md',
  opencode: '.opencode/skills/sprint-artifact/SKILL.md',
  claude: '.claude/skills/sprint-artifact/SKILL.md',
};

function writeSkill(projectRoot: string, relativePath: string): void {
  const fullPath = join(projectRoot, relativePath);
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(fullPath, SKILL_CONTENT);
  console.log(`✓ Skill injected: ${relativePath}`);
}

export async function install(projectRoot: string, assistant?: string): Promise<void> {
  const allAssistants: Assistant[] = ['cursor', 'opencode', 'claude', 'copilot', 'skill'];
  const assistants: Assistant[] = assistant
    ? assistant === 'all'
      ? allAssistants
      : [assistant as Assistant]
    : allAssistants;

  const hasSkillInjectors = assistants.some(a => a in SKILL_PATHS || a === 'skill');

  for (const name of assistants) {
    // Inject SKILL.md to assistant's skill directory
    if (name in SKILL_PATHS) {
      writeSkill(projectRoot, SKILL_PATHS[name]);
    }

    // Install canonical SKILL.md
    if (name === 'skill') {
      writeSkill(projectRoot, '.sprint-artifact/SKILL.md');
    }

    // Skip MCP config for skill-only
    if (name === 'skill') continue;

    // Install MCP config
    const cfg = MCP_CONFIGS[name];
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

  console.log('');
  if (hasSkillInjectors) {
    console.log('Skills injected:');
    for (const name of assistants) {
      if (name === 'skill') console.log('  - .sprint-artifact/SKILL.md (canonical)');
      if (name in SKILL_PATHS) console.log(`  - ${SKILL_PATHS[name]}`);
    }
    console.log('');
  }

  console.log('Next steps:');
  if (assistants.includes('cursor')) console.log('  - Cursor: Restart Cursor or run Cmd+Shift+P > Reload Window');
  if (assistants.includes('claude')) console.log('  - Claude Code: Run `claude mcp list` to verify connection');
  if (assistants.includes('opencode')) console.log('  - OpenCode: Run `opencode mcp list` to verify connection');
  if (assistants.includes('copilot')) console.log('  - Copilot: Restart VS Code to load MCP server');
}
