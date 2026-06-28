# Sprint Artifact

Sprint Artifact management tool with Google Drive integration.

## Architecture

```
Google Drive <-> Core SDK <-> CLI/MCP <-> Cursor/Claude/Codex/OpenCode
```

## Installation

```bash
npm install
npm run build
```

## CLI Usage

```bash
# Initialize project
sprint-artifact init --folder-id <GOOGLE_DRIVE_FOLDER_ID>

# Create backlog item
sprint-artifact backlog create --title "Feature" --description "Description" --priority high

# Sync with Google Drive
sprint-artifact sync

# Show status
sprint-artifact status

# Select task
sprint-artifact select <TASK_ID>

# Move backlog to sprint
sprint-artifact sprint move --backlog-id <BACKLOG_ID> --sprint-id <SPRINT_ID>
```

## MCP Server

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "sprint-artifact": {
      "command": "node",
      "args": ["dist/mcp/index.js"]
    }
  }
}
```

### Available Tools

- `backlog_create` - Create a new backlog item
- `sync_documents` - Sync documents with Google Drive
- `move_to_sprint` - Move a backlog item to a sprint
- `status` - Get current project status
- `select_task` - Select a task to work on

## SDK Usage

```typescript
import { SprintArtifact } from 'sprint-artifact';

const artifact = new SprintArtifact(process.cwd());
await artifact.init('GOOGLE_DRIVE_FOLDER_ID');
await artifact.createBacklog('Feature', 'Description', 'high');
await artifact.sync();
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

Service Account:
```json
{
  "type": "service_account",
  "credentials": {
    "type": "service_account",
    "project_id": "...",
    "private_key_id": "...",
    "private_key": "...",
    "client_email": "...",
    "client_id": "...",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  }
}
```

## License

MIT
