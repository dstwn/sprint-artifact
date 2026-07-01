import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { EOL, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

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

const SKILL_DIRS: Record<string, string> = {
  cursor: '.cursor/skills',
  claude: '.claude/skills',
  opencode: '.opencode/skills',
};

function getPackageSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'skills');
}

function parseSkillFile(filePath: string): { name: string; description: string; body: string } {
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Invalid skill file: ${filePath}`);
  const frontmatter = match[1];
  const body = match[2].trim();
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*"(.+)"$/m);
  if (!nameMatch || !descMatch) throw new Error(`Missing name/description in: ${filePath}`);
  return { name: nameMatch[1].trim(), description: descMatch[1].trim(), body };
}

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
  const skillsDir = getPackageSkillsDir();
  if (!existsSync(skillsDir)) {
    console.warn(`  ⚠ Skills directory not found: ${skillsDir}`);
    return;
  }
  const entries = readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const skill = parseSkillFile(skillFile);
    const extra: Record<string, unknown> = {};
    if (disableModelInvocation) {
      extra['disable-model-invocation'] = true;
    }
    const yaml = buildSkillYaml(skill.name, skill.description, extra);
    const dir = join(baseDir, entry.name);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(dir, 'SKILL.md'), yaml + '\n\n' + skill.body + '\n');
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
