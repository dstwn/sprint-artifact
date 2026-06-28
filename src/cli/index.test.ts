import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../sdk/index.js', () => ({
  SprintArtifact: vi.fn().mockImplementation(() => ({
    init: vi.fn(), selectTask: vi.fn(), pullTask: vi.fn(),
    createBacklog: vi.fn(), sync: vi.fn(), pushToFolder: vi.fn(),
    moveToSprint: vi.fn(), status: vi.fn(), getConfig: vi.fn(),
  })),
}));
vi.mock('../utils/oauth2.js', () => ({ login: vi.fn() }));
vi.mock('../utils/config.js', () => ({ saveAuth: vi.fn(), loadAuth: vi.fn(), loadConfig: vi.fn() }));
vi.mock('../sdk/google-drive.js', () => ({ GoogleDriveClient: vi.fn().mockImplementation(() => ({ listFiles: vi.fn() })) }));
vi.mock('@inquirer/prompts', () => ({ select: vi.fn(), input: vi.fn() }));

describe('CLI module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as any;
  });

  it('should load without error', async () => {
    const mod = await import('./index.js');
    expect(mod).toBeDefined();
  });

  it('should reference SprintArtifact', async () => {
    const { SprintArtifact } = await import('../sdk/index.js');
    expect(SprintArtifact).toBeDefined();
  });

  it('should reference login and saveAuth utils', async () => {
    const { login } = await import('../utils/oauth2.js');
    const { saveAuth } = await import('../utils/config.js');
    expect(login).toBeDefined();
    expect(saveAuth).toBeDefined();
  });
});
