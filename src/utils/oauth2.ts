import { google } from 'googleapis';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import open from 'open';
import type { OAuth2Credentials } from '../types/index.js';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

const GLOBAL_CONFIG_DIR = join(homedir(), '.sprint-artifact');
const GLOBAL_CREDENTIALS_FILE = join(GLOBAL_CONFIG_DIR, 'credentials.json');

const COMMON_CREDENTIALS_PATHS = [
  'credentials.json',
  'client_secret.json',
  'oauth2.json',
  '.credentials.json',
];

export async function findCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  // Check global config first
  if (existsSync(GLOBAL_CREDENTIALS_FILE)) {
    try {
      const content = JSON.parse(await readFile(GLOBAL_CREDENTIALS_FILE, 'utf-8'));
      const creds = content.installed || content.web;
      if (creds?.client_id && creds?.client_secret) {
        return { clientId: creds.client_id, clientSecret: creds.client_secret };
      }
    } catch {}
  }

  // Check common paths in current directory
  for (const path of COMMON_CREDENTIALS_PATHS) {
    if (existsSync(path)) {
      try {
        const content = JSON.parse(await readFile(path, 'utf-8'));
        const creds = content.installed || content.web;
        if (creds?.client_id && creds?.client_secret) {
          return { clientId: creds.client_id, clientSecret: creds.client_secret };
        }
      } catch {}
    }
  }

  return null;
}

export async function saveCredentialsGlobal(credentialsPath: string): Promise<void> {
  if (!existsSync(GLOBAL_CONFIG_DIR)) {
    await mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
  }
  const content = await readFile(credentialsPath, 'utf-8');
  await writeFile(GLOBAL_CREDENTIALS_FILE, content, 'utf-8');
}

export async function login(options?: {
  clientId?: string;
  clientSecret?: string;
  credentialsPath?: string;
}): Promise<OAuth2Credentials> {
  let clientId = options?.clientId;
  let clientSecret = options?.clientSecret;

  // If credentials path provided, read and save globally
  if (options?.credentialsPath) {
    const content = JSON.parse(await readFile(options.credentialsPath, 'utf-8'));
    const creds = content.installed || content.web;
    clientId = creds.client_id;
    clientSecret = creds.client_secret;
    await saveCredentialsGlobal(options.credentialsPath);
    console.log('✓ Credentials saved globally');
  }

  // Auto-detect if not provided
  if (!clientId || !clientSecret) {
    const detected = await findCredentials();
    if (detected) {
      clientId = detected.clientId;
      clientSecret = detected.clientSecret;
      console.log('✓ Credentials auto-detected');
    } else {
      throw new Error(
        'No credentials found. Provide --credentials path or save credentials to ~/.sprint-artifact/credentials.json'
      );
    }
  }

  // Get a random available port
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  server.close();

  const redirectUri = `http://localhost:${port}`;

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  return new Promise((resolve, reject) => {
    const callbackServer = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Error</h1><p>${error}</p>`);
        callbackServer.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Error</h1><p>No code received</p>');
        callbackServer.close();
        reject(new Error('No authorization code received'));
        return;
      }

      try {
        const { tokens } = await oauth2Client.getToken(code);

        const credentials: OAuth2Credentials = {
          client_id: clientId!,
          client_secret: clientSecret!,
          redirect_uris: [redirectUri],
          refresh_token: tokens.refresh_token || undefined,
          access_token: tokens.access_token || undefined,
          token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
        };

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #4CAF50;">✓ Login Successful</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);

        callbackServer.close();
        resolve(credentials);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Error</h1><p>Failed to get tokens</p>');
        callbackServer.close();
        reject(err);
      }
    });

    callbackServer.listen(port, () => {
      console.log(`Opening browser for login (port ${port})...`);
      open(authUrl).catch(() => {
        console.log(`\nOpen this URL manually:\n${authUrl}\n`);
      });
    });

    callbackServer.on('error', (err) => {
      reject(err);
    });
  });
}
