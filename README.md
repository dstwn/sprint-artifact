# Sprint Artifact

Sprint Artifact management tool with Google Drive integration.

Manage your sprint artifacts (BRD, PRD, tasks, backlogs) directly from CLI or AI assistants (Cursor, Claude, Codex, OpenCode).

## Features

- **CLI** - Full command-line interface for sprint management
- **MCP Server** - Integration with AI coding assistants
- **SDK** - Programmatic access for custom workflows
- **Google Drive Sync** - Bi-directional sync with Google Drive (Shared Drive supported)
- **OAuth2 Login** - Simple Google account login for team members
- **Interactive Setup** - Year and folder selection from Google Drive

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
   - User Type: **Internal** (Workspace) atau **External** + Testing mode
   - App name: `sprint-artifact`
   - Tambah email team di **Test users**
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

Browser terbuka > pilih akun Google > copy URL callback > paste di terminal.

### Initialize Project

```bash
# Copy folder ID dari URL Google Drive (Shared Drive atau personal)
# https://drive.google.com/drive/folders/FOLDER_ID_INI
sprint-artifact init --folder-id <FOLDER_ID>
```

Interactive prompts:
1. **Select year** - ambil dari folder yang ada di Google Drive
2. **Select default folder** - pilih folder Backlogs/Sprint untuk backlog items

### Create Backlog

```bash
sprint-artifact backlog create --id IDS-123 --title "Fix login bug"
```

Otomatis buat folder structure:
```
[Selected Folder]/
└── IDS-123 Fix login bug/
    ├── 01. Business Requirement Documents/
    ├── 02. Technical Documents/
    ├── 03. Testing Documents/
    ├── 04. User Acceptance Test Documents/
    └── 05. Guide Documents/
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `login` | Login dengan Google account |
| `init` | Initialize project (pilih tahun & folder) |
| `backlog create` | Buat backlog item dengan folder structure |
| `sync` | Sync dengan Google Drive |
| `status` | Lihat status project |
| `select` | Pilih task yang sedang dikerjakan |
| `sprint move` | Pindahkan backlog ke sprint |

### Options

```bash
# Login
sprint-artifact login [--credentials <path>]

# Init
sprint-artifact init --folder-id <ID> [--year <tahun>]

# Backlog
sprint-artifact backlog create --id IDS-123 --title "Task Title"

# Select
sprint-artifact select <TASK_ID>

# Sprint
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
| `backlog_create` | Buat backlog item dengan folder structure |
| `sync_documents` | Sync dokumen dengan Google Drive |
| `move_to_sprint` | Pindahkan backlog ke sprint |
| `status` | Lihat status project |
| `select_task` | Pilih task yang sedang dikerjakan |

## SDK Usage

```typescript
import { SprintArtifact } from 'sprint-artifact';

const artifact = new SprintArtifact(process.cwd());

// Init dengan folder ID dan tahun
await artifact.init('GOOGLE_DRIVE_FOLDER_ID', '2026', 'BACKLOGS_FOLDER_ID');

// Buat backlog
await artifact.createBacklog('IDS-123', 'Fix login bug', 'FOLDER_ID');

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
    "folderId": "shared-drive-folder-id",
    "year": "2026",
    "defaultFolderId": "backlogs-folder-id"
  },
  "selectedTask": "IDS-123",
  "manifest": {
    "lastSync": "2026-06-28T10:00:00Z",
    "files": []
  }
}
```

### `.sprint-artifact/auth.json`

Auto-generated saat login. Jangan commit ke repository.

## Google Drive Structure

```
Sprint Artifacts/ (Shared Drive)
├── 2024/
│   ├── Backlogs/
│   └── Sprint 1/
├── 2025/
│   ├── Backlogs/
│   └── Sprint 1/
└── 2026/                    ← user pilih tahun saat init
    ├── Backlogs/            ← user pilih folder saat init
    │   ├── IDS-123 Fix login bug/
    │   │   ├── 01. Business Requirement Documents/
    │   │   ├── 02. Technical Documents/
    │   │   ├── 03. Testing Documents/
    │   │   ├── 04. User Acceptance Test Documents/
    │   │   └── 05. Guide Documents/
    │   └── IDS-456 Another task/
    ├── Sprint 1/
    └── Sprint 2/
```

## Security

- `auth.json` dan `credentials.json` di-**gitignore** secara default
- Setiap user login dengan akun Google masing-masing
- Token tersimpan lokal di tiap komputer
- Untuk team, share `credentials.json` via internal docs (bukan public repo)
- Support **Shared Drive** (Google Workspace)

## License

MIT
