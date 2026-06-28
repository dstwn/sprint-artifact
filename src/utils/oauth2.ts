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
  if (existsSync(GLOBAL_CREDENTIALS_FILE)) {
    try {
      const content = JSON.parse(await readFile(GLOBAL_CREDENTIALS_FILE, 'utf-8'));
      const creds = content.installed || content.web;
      if (creds?.client_id && creds?.client_secret) {
        return { clientId: creds.client_id, clientSecret: creds.client_secret };
      }
    } catch {}
  }

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

async function exchangeCodeForTokens(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<OAuth2Credentials> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  let data: any;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    data = await res.json();
  } catch {
    // Fallback to curl if fetch fails
    const { execSync } = await import('node:child_process');
    const result = execSync(`curl -s -X POST https://oauth2.googleapis.com/token -d "${body.toString()}"`, { encoding: 'utf-8' });
    data = JSON.parse(result);
  }
  
  if (data.error) {
    throw new Error(`OAuth error: ${data.error} - ${data.error_description}`);
  }

  return {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [redirectUri],
    refresh_token: data.refresh_token || undefined,
    access_token: data.access_token || undefined,
    token_expiry: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined,
  };
}

export async function login(options?: {
  clientId?: string;
  clientSecret?: string;
  credentialsPath?: string;
}): Promise<OAuth2Credentials> {
  let clientId = options?.clientId;
  let clientSecret = options?.clientSecret;

  if (options?.credentialsPath) {
    const content = JSON.parse(await readFile(options.credentialsPath, 'utf-8'));
    const creds = content.installed || content.web;
    clientId = creds.client_id;
    clientSecret = creds.client_secret;
    await saveCredentialsGlobal(options.credentialsPath);
    console.log('✓ Credentials saved globally');
  }

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

  const redirectUri = `http://localhost`;

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(SCOPES[0])}&access_type=offline&prompt=consent`;

  return new Promise((resolve, reject) => {
    const callbackServer = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost`);

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
        const credentials = await exchangeCodeForTokens(code, clientId!, clientSecret!, redirectUri);

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

    callbackServer.listen(0, () => {
      const addr = callbackServer.address();
      const listenPort = typeof addr === 'object' && addr ? addr.port : 0;
      console.log(`Opening browser for login (port ${listenPort})...`);
      console.log('\nAfter login, copy the URL from browser and paste here:');
      open(authUrl).catch(() => {
        console.log(`\nOpen this URL manually:\n${authUrl}\n`);
      });

      process.stdin.setEncoding('utf-8');
      process.stdin.resume();
      process.stdin.on('data', async (data: string) => {
        const input = data.toString().trim();
        if (!input) return;

        try {
          const url = new URL(input);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            callbackServer.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (code) {
            try {
              const credentials = await exchangeCodeForTokens(code, clientId!, clientSecret!, redirectUri);
              callbackServer.close();
              resolve(credentials);
            } catch (err) {
              callbackServer.close();
              reject(err);
            }
          }
        } catch (err) {
          // Invalid URL, ignore
        }
      });
    });

    callbackServer.on('error', (err) => {
      reject(err);
    });
  });
}
