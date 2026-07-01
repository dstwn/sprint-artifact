import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('node:fs', () => fsMock);

vi.mock('node:url', () => ({
  fileURLToPath: vi.fn(() => '/usr/lib/node_modules/sprint-artifact/dist/cli/install.js'),
}));

import { install } from './install.js';

const SKILL_CONTENT = `---
name: test-skill
description: "Test skill description"
---

Test body content.`;

describe('install', () => {
  const projectRoot = '/fake/project';

  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.readdirSync.mockReturnValue([
      { name: 'sprint-artifact', isDirectory: () => true },
      { name: 'sprint-artifact-init', isDirectory: () => true },
    ]);
    fsMock.readFileSync.mockImplementation((path: string) => {
      if (path.includes('SKILL.md')) return SKILL_CONTENT;
      if (path.includes('mcp.json')) return '{}';
      return '';
    });
  });

  it('should install all assistants by default', async () => {
    fsMock.existsSync.mockImplementation((p: string) => p.includes('skills'));
    await install(projectRoot);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should install specific assistant', async () => {
    fsMock.existsSync.mockImplementation((p: string) => p.includes('skills'));
    await install(projectRoot, 'cursor');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should install skill-only', async () => {
    fsMock.existsSync.mockImplementation((p: string) => p.includes('skills'));
    await install(projectRoot, 'skill');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should install "all" assistants explicitly', async () => {
    fsMock.existsSync.mockImplementation((p: string) => p.includes('skills'));
    await install(projectRoot, 'all');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should merge with existing config when file exists', async () => {
    fsMock.existsSync.mockImplementation((p: string) => p.includes('mcp.json') || p.includes('skills'));
    fsMock.readFileSync.mockImplementation((path: string) => {
      if (path.includes('SKILL.md')) return SKILL_CONTENT;
      if (path.includes('mcp.json')) return JSON.stringify({ mcpServers: { existing: { command: 'old' } } });
      return '';
    });
    await install(projectRoot, 'cursor');
    const written = JSON.parse(fsMock.writeFileSync.mock.calls.find((c: any) => c[0].toString().includes('mcp.json'))![1] as string);
    expect(written.mcpServers.existing).toBeDefined();
    expect(written.mcpServers['sprint-artifact']).toBeDefined();
  });

  it('should handle parse error of existing config', async () => {
    fsMock.existsSync.mockImplementation((p: string) => p.includes('mcp.json') || p.includes('skills'));
    fsMock.readFileSync.mockImplementation((path: string) => {
      if (path.includes('SKILL.md')) return SKILL_CONTENT;
      return 'invalid json';
    });
    await install(projectRoot, 'cursor');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should create output files for opencode, claude, copilot', async () => {
    fsMock.existsSync.mockImplementation((p: string) => p.includes('skills'));
    await install(projectRoot, 'all');
    const writtenPaths = fsMock.writeFileSync.mock.calls.map((c: any) => c[0]);
    expect(writtenPaths.some((p: string) => p.includes('opencode.json'))).toBe(true);
    expect(writtenPaths.some((p: string) => p.includes('.mcp.json'))).toBe(true);
    expect(writtenPaths.some((p: string) => p.includes('.vscode/mcp.json'))).toBe(true);
  });

  it('should create skill files from skills/ folder', async () => {
    fsMock.existsSync.mockImplementation((p: string) => p.includes('skills'));
    await install(projectRoot, 'skill');
    const writtenPaths = fsMock.writeFileSync.mock.calls.map((c: any) => c[0]);
    expect(writtenPaths.some((p: string) => p.includes('SKILL.md'))).toBe(true);
  });

  it('should skip skill install when skills dir missing', async () => {
    fsMock.existsSync.mockReturnValue(false);
    await install(projectRoot, 'skill');
    const skillWrites = fsMock.writeFileSync.mock.calls.filter((c: any) => c[0].toString().includes('SKILL.md'));
    expect(skillWrites.length).toBe(0);
  });
});
