import { google } from 'googleapis';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import open from 'open';
import type { OAuth2Credentials } from '../types/index.js';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

export async function login(clientId: string, clientSecret: string, projectRoot: string): Promise<OAuth2Credentials> {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);
      
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Error</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Error</h1><p>No code received</p>');
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        try {
          const { tokens } = await oauth2Client.getToken(code);
          
          const credentials: OAuth2Credentials = {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uris: [REDIRECT_URI],
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
          
          server.close();
          resolve(credentials);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<h1>Error</h1><p>Failed to get tokens</p>');
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`Opening browser for login...`);
      open(authUrl).catch(() => {
        console.log(`\nOpen this URL manually:\n${authUrl}\n`);
      });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}
