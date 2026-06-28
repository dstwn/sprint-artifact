import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:fs', () => fsMock);

import { install } from './install.js';

describe('install', () => {
  const projectRoot = '/fake/project';

  beforeEach(() => { vi.clearAllMocks(); });

  it('should install all assistants by default', async () => {
    fsMock.existsSync.mockReturnValue(false);
    await install(projectRoot);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should install specific assistant', async () => {
    fsMock.existsSync.mockReturnValue(false);
    await install(projectRoot, 'cursor');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should install skill-only', async () => {
    fsMock.existsSync.mockReturnValue(false);
    await install(projectRoot, 'skill');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should install "all" assistants explicitly', async () => {
    fsMock.existsSync.mockReturnValue(false);
    await install(projectRoot, 'all');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should merge with existing config when file exists', async () => {
    fsMock.existsSync.mockImplementation((path: any) => path.toString().includes('mcp.json'));
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ mcpServers: { existing: { command: 'old' } } }));
    await install(projectRoot, 'cursor');
    const written = JSON.parse(fsMock.writeFileSync.mock.calls.find((c: any) => c[0].toString().includes('mcp.json'))![1] as string);
    expect(written.mcpServers.existing).toBeDefined();
    expect(written.mcpServers['sprint-artifact']).toBeDefined();
  });

  it('should handle parse error of existing config', async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('invalid json');
    await install(projectRoot, 'cursor');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('should create output files for opencode, claude, copilot', async () => {
    fsMock.existsSync.mockReturnValue(false);
    await install(projectRoot, 'all');
    const writtenPaths = fsMock.writeFileSync.mock.calls.map((c: any) => c[0]);
    expect(writtenPaths.some((p: string) => p.includes('opencode.json'))).toBe(true);
    expect(writtenPaths.some((p: string) => p.includes('.mcp.json'))).toBe(true);
    expect(writtenPaths.some((p: string) => p.includes('.vscode/mcp.json'))).toBe(true);
  });

  it('should create skill files', async () => {
    fsMock.existsSync.mockReturnValue(false);
    await install(projectRoot, 'skill');
    const writtenPaths = fsMock.writeFileSync.mock.calls.map((c: any) => c[0]);
    expect(writtenPaths.some((p: string) => p.includes('SKILL.md'))).toBe(true);
  });
});
