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

## CLI Commands

### Task Management

```bash
# Select active task (interactive)
sprint-artifact select

# Create backlog item dengan folder structure
sprint-artifact backlog create --id IDS-123 --title "Fix login bug"
```

### Pull & Push

```bash
# Pull task dari Google Drive ke local
sprint-artifact pull                          # interactive
sprint-artifact pull --backlog                # dari Backlogs
sprint-artifact pull --sprint "Sprint 1"      # dari Sprint

# Push file dari local ke Google Drive
sprint-artifact push --tech-docs              # push .planning/ ke 02. Technical Documents/
```

### Sync & Status

```bash
# Sync manifest dengan Google Drive
sprint-artifact sync

# Lihat status project
sprint-artifact status
```

### Sprint Management

```bash
# Pindahkan backlog ke sprint
sprint-artifact sprint move --backlog-id IDS-123 --sprint-id "Sprint 1"
```

## Command Reference

| Command | Description |
|---------|-------------|
| `login` | Login dengan Google account |
| `init` | Initialize project (pilih tahun & folder) |
| `select` | Pilih active task |
| `backlog create` | Buat backlog item dengan folder structure |
| `pull` | Pull task dari Google Drive ke local |
| `push` | Push file dari local ke Google Drive |
| `sync` | Sync manifest dengan Google Drive |
| `status` | Lihat status project |
| `sprint move` | Pindahkan backlog ke sprint |

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

// Select task
await artifact.selectTask('IDS-123 Fix login bug', 'folder-id', 'parent-folder-id');

// Buat backlog
await artifact.createBacklog('IDS-123', 'Fix login bug', 'FOLDER_ID');

// Push tech docs
await artifact.pushTechDocs();

// Pull task
await artifact.pullTask('task-folder-id', 'IDS-123 Fix login bug', './local-path');

// Sync manifest
const result = await artifact.sync();
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
  "selectedTask": "IDS-123 Fix login bug",
  "selectedTaskId": "task-folder-id",
  "selectedTaskFolderId": "parent-folder-id",
  "manifest": {
    "lastSync": "2026-06-28T10:00:00Z",
    "files": []
  }
}
```

### `.sprint-artifact/auth.json`

Auto-generated saat login. Jangan commit ke repository.

## Local Structure

```
.sprint-artifact/
├── config.json         # Project config
├── auth.json           # OAuth2 tokens (auto-generated)
├── backlogs/           # Pulled backlog tasks
│   └── IDS-123 Fix login bug/
│       ├── 01. Business Requirement Documents/
│       ├── 02. Technical Documents/
│       ├── 03. Testing Documents/
│       ├── 04. User Acceptance Test Documents/
│       └── 05. Guide Documents/
└── sprints/            # Pulled sprint tasks
    └── IDS-456 Another task/
```

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

## Workflow

### Daily Flow

```bash
# 1. Select task yang sedang dikerjakan
sprint-artifact select

# 2. Pull task dari Google Drive
sprint-artifact pull --backlog

# 3. Edit file di local (.sprint-artifact/backlogs/...)

# 4. Push perubahan ke Google Drive
sprint-artifact push --tech-docs

# 5. Sync manifest
sprint-artifact sync
```

### Create New Task

```bash
# 1. Buat task di Google Drive
sprint-artifact backlog create --id IDS-123 --title "Fix login bug"

# 2. Select task
sprint-artifact select

# 3. Pull task ke local
sprint-artifact pull --backlog

# 4. Edit dan push
sprint-artifact push --tech-docs
```

## Security

- `auth.json` dan `credentials.json` di-**gitignore** secara default
- Setiap user login dengan akun Google masing-masing
- Token tersimpan lokal di tiap komputer
- Untuk team, share `credentials.json` via internal docs (bukan public repo)
- Support **Shared Drive** (Google Workspace)

## License

MIT
