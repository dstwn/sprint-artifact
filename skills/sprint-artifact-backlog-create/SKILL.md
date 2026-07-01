---
name: sprint-artifact-backlog-create
description: "Create a backlog item with standardized 5-subfolder structure in Google Drive. Auto-selects and auto-pulls."
---

Create a new backlog item with standardized folder structure. Auto-selects and auto-pulls.

## Steps

1. Ask the user for:
   - **id** (required): task ID (e.g., "IDS-123")
   - **title** (required): task title
2. Call `backlog_create` MCP tool:
   ```
   backlog_create(id, title)
   ```
   - Optional: `folderId` (uses default from config if omitted)

Creates folder structure in Drive:
- 01. Business Requirement Documents
- 02. Technical Documents
- 03. Testing Documents
- 04. User Acceptance Test Documents
- 05. Guide Documents

Task is auto-selected and pulled to `.sprint-artifact/backlogs/<id> <title>/`.
