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

interface SkillFrontmatter {
  name: string;
  description: string;
  'disable-model-invocation'?: boolean;
  license?: string;
  metadata?: Record<string, string>;
}

function buildSkillYaml(frontmatter: SkillFrontmatter): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${frontmatter.name}`);
  lines.push(`description: "${frontmatter.description.replace(/"/g, '\\"')}"`);
  if (frontmatter['disable-model-invocation']) {
    lines.push('disable-model-invocation: true');
  }
  if (frontmatter.license) {
    lines.push(`license: ${frontmatter.license}`);
  }
  if (frontmatter.metadata) {
    lines.push('metadata:');
    for (const [k, v] of Object.entries(frontmatter.metadata)) {
      lines.push(`  ${k}: "${v}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

const SKILL_BODY = `# Sprint Artifact

Manage sprint artifacts (backlogs, tasks, documents) with Google Drive integration.

## When to Use

- Creating a new backlog item and its folder structure
- Selecting a task to work on (browse folders → pick task → auto-pull)
- Pulling task files from Google Drive to local workspace
- Pushing planning documents (.planning/) to an active task
- Bidirectional sync between local and remote for active task
- Moving a task between Backlogs and Sprint folders
- Checking project configuration and active task status
- Setting up a new project with Google Drive folder mapping

## Available Commands

Type \`/<command>\` in chat to invoke:

- **/sprint-artifact-init** — Initialize project config: provides \`init_project\` MCP tool with folderId (root SprintArtifacts Drive folder), optional year, optional defaultFolderId
- **/sprint-artifact-select** — Browse folders and select active task: use \`list_folders\` to browse year/subfolders, \`list_tasks\` to see tasks, then \`select_task\` with taskName, taskId, taskType. Auto-pulls to \`.sprint-artifact/<type>/<task>/\`
- **/sprint-artifact-backlog-create** — Create backlog with 5-subfolder structure: use \`backlog_create\` with id (e.g. "IDS-123"), title, optional folderId. Creates 01-05 subfolders, auto-selects and pulls
- **/sprint-artifact-pull** — Pull task from Drive: use \`list_folders\` and \`list_tasks\` to browse, then \`pull_task\` with taskId, taskName, taskType. Downloads to \`.sprint-artifact/<type>/<task>/\`
- **/sprint-artifact-push** — Push .planning/ to active task: ensure task selected, use \`push_files\` with optional subfolder name. Auto-syncs after push
- **/sprint-artifact-sync** — Bidirectional sync for active task: use \`sync_documents\` with no params. Pulls remote new files, uploads local new files
- **/sprint-artifact-move** — Move task between Backlogs/Sprints: \`list_folders\` → \`list_tasks\` → \`move_to_sprint\` with taskFolderId, newParentFolderId, optional taskName. Local folder moves automatically
- **/sprint-artifact-status** — Show project config and active task: use \`status\` with no params

## MCP Tools

| Tool | Params | Description |
|------|--------|-------------|
| \`list_folders\` | folderId? | List year folders or subfolders |
| \`list_tasks\` | folderId | List tasks (backlog/sprint items) |
| \`init_project\` | folderId, year?, defaultFolderId? | Initialize project config |
| \`backlog_create\` | id, title, folderId? | Create backlog with subfolder structure |
| \`select_task\` | taskName, taskId, taskType | Select active task and auto-pull |
| \`pull_task\` | taskId, taskName, taskType | Pull task from Drive to local |
| \`push_files\` | subfolder? | Push .planning/ to active task |
| \`sync_documents\` | — | Bidirectional sync |
| \`move_to_sprint\` | taskFolderId, newParentFolderId, taskName? | Move task folder |
| \`status\` | — | Show config and active task |

## Folder Structure

\`\`\`
SprintArtifacts/ → YYYY/ → Backlogs|Sprints/ → ID-Title/ → 01..05 subfolders
\`\`\`

Local workspace: \`.sprint-artifact/backlogs|sprints/<task>/\`
Push source: \`.planning/\`
`;

function skillContent(extraFrontmatter: Partial<SkillFrontmatter> = {}): string {
  const fm: SkillFrontmatter = {
    name: 'sprint-artifact',
    description: 'Manage sprint artifacts (backlogs, tasks, documents) with Google Drive. Commands: init, select, backlog create, pull, push, sync, sprint move, status. MCP tools: list_folders, list_tasks, init_project, backlog_create, select_task, pull_task, push_files, sync_documents, move_to_sprint, status. USE FOR: creating backlogs, selecting tasks, pushing planning docs, syncing with Google Drive, moving tasks to sprints, viewing project status. DO NOT USE FOR: general document editing, team chat, project management outside of artifact workflow.',
    license: 'MIT',
    metadata: { version: '0.6.1' },
    ...extraFrontmatter,
  };
  return buildSkillYaml(fm) + '\n\n' + SKILL_BODY;
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

function installSkillToDir(dir: string, extraFrontmatter: Partial<SkillFrontmatter> = {}): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, 'SKILL.md'), skillContent(extraFrontmatter));
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
        installSkillToDir(
          join(homedir(), '.agents', 'skills', 'sprint-artifact')
        );
        console.log('  → ~/.agents/skills/sprint-artifact/SKILL.md');
        break;
      case 'cursor':
        installMcpConfig(projectRoot, 'cursor');
        installSkillToDir(
          join(projectRoot, '.cursor', 'skills', 'sprint-artifact'),
          { 'disable-model-invocation': true }
        );
        console.log('  → .cursor/skills/sprint-artifact/SKILL.md');
        break;
      case 'claude':
        installMcpConfig(projectRoot, 'claude');
        installSkillToDir(
          join(projectRoot, '.claude', 'skills', 'sprint-artifact')
        );
        console.log('  → .claude/skills/sprint-artifact/SKILL.md');
        break;
      case 'copilot':
        installMcpConfig(projectRoot, 'copilot');
        break;
      case 'skill':
        installSkillToDir(
          join(projectRoot, '.sprint-artifact', 'skills', 'sprint-artifact')
        );
        console.log('  → .sprint-artifact/skills/sprint-artifact/SKILL.md');
        break;
    }
  }

  console.log('');
  console.log('Next steps:');
  if (assistants.includes('cursor')) console.log('  - Cursor: Type /sprint-artifact in Agent chat, or restart Cursor');
  if (assistants.includes('claude')) console.log('  - Claude Code: Run `claude mcp list` to verify connection');
  if (assistants.includes('opencode')) console.log('  - OpenCode: Restart session, type /sprint-artifact to invoke');
  if (assistants.includes('copilot')) console.log('  - Copilot: Restart VS Code to load MCP server');
  if (assistants.includes('skill')) console.log('  - Reference .sprint-artifact/skills/sprint-artifact/');
}
