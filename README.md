# Sprint Artifact

Sprint Artifact management tool with Google Drive integration.

Manage your sprint artifacts (BRD, PRD, tasks, backlogs) directly from CLI or AI assistants (Cursor, Claude, Codex, OpenCode).

## Features

- **CLI** - Full command-line interface for sprint management
- **MCP Server** - Integration with AI coding assistants
- **SDK** - Programmatic access for custom workflows
- **Google Drive Sync** - Bi-directional sync with Google Drive
- **OAuth2 Login** - Simple Google account login for team members

## Quick Start

### Install

```bash
npm install -g sprint-artifact
```

### Setup Google Cloud

1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Buat/select project
3. Enable **Google Drive API** (APIs & Services > Library)
4. Buat **OAuth consent screen** (APIs & Services > OAuth consent screen)
   - User Type: **Internal** (Workspace) atau **External**
   - App name: `sprint-artifact`
5. Buat **OAuth 2.0 Client ID** (APIs & Services > Credentials)
   - Application type: **Desktop app**
   - Download JSON

### Login

```bash
# Taruh credentials.json di folder project atau ~/.sprint-artifact/
cp ~/Downloads/credentials.json ./credentials.json

# Login dengan Google account
sprint-artifact login
```

Browser terbuka > pilih akun Google > selesai.

### Initialize Project

```bash
# Buat folder di Google Drive, copy folder ID dari URL
sprint-artifact init --folder-id <GOOGLE_DRIVE_FOLDER_ID>
```

## CLI Commands

```bash
# Login dengan Google account
sprint-artifact login [--credentials <path>]

# Initialize project
sprint-artifact init --folder-id <FOLDER_ID>

# Buat backlog item
sprint-artifact backlog create --title "Feature" --desc "Description" --priority high

# Sync dengan Google Drive
sprint-artifact sync

# Lihat status
sprint-artifact status

# Pilih task yang sedang dikerjakan
sprint-artifact select <TASK_ID>

# Pindahkan backlog ke sprint
sprint-artifact sprint move --backlog-id <ID> --sprint-id <ID>
```

## MCP Server

Tambahkan ke konfigurasi MCP (Cursor, Claude, dll):

```json
{
  "mcpServers": {
    "sprint-artifact": {
      "command": "sprint-artifact",
      "args": ["mcp"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `backlog_create` | Buat backlog item baru |
| `sync_documents` | Sync dokumen dengan Google Drive |
| `move_to_sprint` | Pindahkan backlog ke sprint |
| `status` | Lihat status project |
| `select_task` | Pilih task yang sedang dikerjakan |

## SDK Usage

```typescript
import { SprintArtifact } from 'sprint-artifact';

const artifact = new SprintArtifact(process.cwd());

// Login (hanya perlu sekali)
await artifact.init('GOOGLE_DRIVE_FOLDER_ID');

// Buat backlog
await artifact.createBacklog('Feature A', 'Description', 'high');

// Sync dengan Google Drive
const result = await artifact.sync();
console.log(`Added: ${result.added}, Updated: ${result.updated}`);
```

## Configuration

### `.sprint-artifact/config.json`

```json
{
  "version": 1,
  "googleDrive": {
    "folderId": "your-folder-id"
  },
  "selectedTask": "task-id",
  "manifest": {
    "lastSync": "2024-01-01T00:00:00Z",
    "files": []
  }
}
```

### `.sprint-artifact/auth.json`

Auto-generated saat login. Jangan commit ke repository.

## Project Structure

```
.sprint-artifact/
├── config.json    # Project config (folder ID, manifest)
└── auth.json      # OAuth2 tokens (auto-generated)
```

## Security

- `auth.json` dan `credentials.json` di-**gitignore** secara default
- Setiap user login dengan akun Google masing-masing
- Token tersimpan lokal di tiap komputer
- Untuk team, share `credentials.json` via internal docs (bukan public repo)

## License

MIT
