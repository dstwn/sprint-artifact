# Sprint Artifact

Sprint Artifact management tool with Google Drive integration.

Manage your sprint artifacts (BRD, PRD, tasks, backlogs) directly from CLI or AI assistants (Cursor, Claude, Codex, OpenCode).

## Features

- **CLI** - Full command-line interface for sprint management
- **MCP Server** - Integration with AI coding assistants
- **SDK** - Programmatic access for custom workflows
- **Google Drive Sync** - Bi-directional sync with Google Drive (Shared Drive supported)
- **OAuth2 Login** - Simple Google account login for team members
- **Auto Token Refresh** - Seamless token management
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
# Select active task (interactive + auto pull)
sprint-artifact select

# Create backlog item dengan folder structure (auto-select + auto-pull)
sprint-artifact backlog create                           # interactive prompts
sprint-artifact backlog create --id IDS-123 --title "Fix login bug"  # non-interactive
```

### Pull & Push

```bash
# Pull task dari Google Drive ke local
sprint-artifact pull                          # interactive
sprint-artifact pull --backlog                # dari Backlogs
sprint-artifact pull --sprint "Sprint 1"      # dari Sprint

# Push file dari local ke Google Drive (auto pull setelah push)
sprint-artifact push                          # interactive
sprint-artifact push --tech-docs              # langsung ke 02. Technical Documents
```

### Move Task

```bash
# Pindahkan task antar folder (interactive)
sprint-artifact sprint move
```

Interactive prompts:
1. **Select source folder** - Backlogs/Sprint 1/etc
2. **Select task** - task yang akan dipindah
3. **Select destination** - folder tujuan

### Sync & Status

```bash
# Sync dari active task (pull file baru/updated + upload file lokal baru)
sprint-artifact sync

# Lihat status project
sprint-artifact status
```

### Install AI Assistant Integration

```bash
# Install MCP config untuk semua assistant (cursor, opencode, claude, copilot)
sprint-artifact install

# Install untuk assistant tertentu
sprint-artifact install cursor
sprint-artifact install opencode
sprint-artifact install claude
sprint-artifact install copilot

# Install skill file aja
sprint-artifact install skill

# Install semua (termasuk skill)
sprint-artifact install all
```

## Command Reference

| Command | Description |
|---------|-------------|
| `mcp` | Run MCP server untuk AI assistant integration |
| `install` | Install MCP config + skill untuk AI coding assistants |
| `login` | Login dengan Google account |
| `init` | Initialize project (pilih tahun & folder) |
| `select` | Pilih active task + auto pull ke local |
| `backlog create` | Buat backlog item + auto-select + auto-pull ke local |
| `pull` | Pull task dari Google Drive ke local |
| `push` | Push file dari local ke Google Drive + auto pull |
| `sprint move` | Pindahkan task antar folder (local folder ikut pindah) |
| `sync` | Sync active task (pull remote + upload local baru) |
| `status` | Lihat status project |

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
| `list_folders` | Lihat struktur folder tahun + subfolder (Backlogs/Sprints) |
| `list_tasks` | Lihat daftar task dalam folder |
| `backlog_create` | Buat backlog item + auto-select + auto-pull (folderId opsional) |
| `select_task` | Pilih task aktif (auto-pull ke local) |
| `pull_task` | Pull task dari Google Drive ke local |
| `push_files` | Push .planning ke task aktif (opsional subfolder) |
| `sync_documents` | Sync bidirectional dari active task |
| `move_to_sprint` | Pindahkan task + local folder ikut pindah |
| `init_project` | Initialize project Sprint Artifact |
| `status` | Lihat status project |

## SDK Usage

```typescript
import { SprintArtifact } from 'sprint-artifact';

const artifact = new SprintArtifact(process.cwd());

// Init dengan folder ID dan tahun
await artifact.init('GOOGLE_DRIVE_FOLDER_ID', '2026', 'BACKLOGS_FOLDER_ID');

// Select task (auto pull ke local)
await artifact.selectTask('IDS-123 Fix login bug', 'folder-id', 'parent-folder-id', 'backlogs');

// Buat backlog (auto-select + auto-pull ke .sprint-artifact/backlogs/)
await artifact.createBacklog('IDS-123', 'Fix login bug', 'FOLDER_ID');

// Push tech docs (auto pull setelah push)
await artifact.pushToFolder('target-folder-id');

// Pull task
await artifact.pullTask('task-folder-id', 'IDS-123 Fix login bug', './local-path');

// Move task ke folder lain (local folder ikut pindah)
await artifact.moveToSprint('task-folder-id', 'new-parent-folder-id', 'IDS-123 Fix login bug');

// Sync bidirectional dari active task (pull remote + upload local baru)
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
  "selectedTaskType": "backlogs",
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
├── auth.json           # OAuth2 tokens (auto-generated, auto-refresh)
├── backlogs/           # Pulled backlog tasks (auto dari select)
│   └── IDS-123 Fix login bug/
│       ├── 01. Business Requirement Documents/
│       ├── 02. Technical Documents/
│       ├── 03. Testing Documents/
│       ├── 04. User Acceptance Test Documents/
│       └── 05. Guide Documents/
└── sprints/            # Pulled sprint tasks (auto dari select)
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
# 1. Select task (otomatis pull ke local)
sprint-artifact select

# 2. Edit file di local (.sprint-artifact/backlogs/...)

# 3. Push perubahan ke Google Drive (otomatis pull balik + sync)
sprint-artifact push

# 4. Sync (cek perubahan dari remote)
sprint-artifact sync
```

### Create New Task

```bash
# 1. Buat task di Google Drive (otomatis select + pull ke local)
sprint-artifact backlog create

# 2. Edit file di local (.sprint-artifact/backlogs/...)

# 3. Push dan sync
sprint-artifact push --tech-docs
sprint-artifact sync
```

### Move Task to Sprint

```bash
# 1. Move task dari Backlogs ke Sprint (local folder ikut pindah)
sprint-artifact sprint move

# 2. Select task yang sudah dipindah (otomatis pull ke .sprint-artifact/sprints/)
sprint-artifact select
```

## Security

- `auth.json` dan `credentials.json` di-**gitignore** secara default
- Setiap user login dengan akun Google masing-masing
- Token tersimpan lokal di tiap komputer
- **Auto token refresh** - tidak perlu login ulang
- Untuk team, share `credentials.json` via internal docs (bukan public repo)
- Support **Shared Drive** (Google Workspace)

## License

MIT
