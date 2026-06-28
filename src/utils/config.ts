import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { SprintArtifactConfig, AuthConfig } from '../types/index.js';

const CONFIG_DIR = '.sprint-artifact';
const CONFIG_FILE = 'config.json';
const AUTH_FILE = 'auth.json';

export async function getConfigPath(projectRoot: string): Promise<string> {
  return join(projectRoot, CONFIG_DIR);
}

export async function ensureConfigDir(projectRoot: string): Promise<void> {
  const configPath = await getConfigPath(projectRoot);
  if (!existsSync(configPath)) {
    await mkdir(configPath, { recursive: true });
  }
}

export async function loadConfig(projectRoot: string): Promise<SprintArtifactConfig | null> {
  const configPath = join(projectRoot, CONFIG_DIR, CONFIG_FILE);
  if (!existsSync(configPath)) {
    return null;
  }
  const content = await readFile(configPath, 'utf-8');
  return JSON.parse(content);
}

export async function saveConfig(projectRoot: string, config: SprintArtifactConfig): Promise<void> {
  await ensureConfigDir(projectRoot);
  const configPath = join(projectRoot, CONFIG_DIR, CONFIG_FILE);
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function loadAuth(projectRoot: string): Promise<AuthConfig | null> {
  const authPath = join(projectRoot, CONFIG_DIR, AUTH_FILE);
  if (!existsSync(authPath)) {
    return null;
  }
  const content = await readFile(authPath, 'utf-8');
  return JSON.parse(content);
}

export async function saveAuth(projectRoot: string, auth: AuthConfig): Promise<void> {
  await ensureConfigDir(projectRoot);
  const authPath = join(projectRoot, CONFIG_DIR, AUTH_FILE);
  await writeFile(authPath, JSON.stringify(auth, null, 2), 'utf-8');
}

export function getDefaultConfig(): SprintArtifactConfig {
  return {
    version: 1,
    googleDrive: {
      folderId: '',
    },
  };
}
