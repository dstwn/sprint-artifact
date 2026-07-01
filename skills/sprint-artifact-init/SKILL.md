---
name: sprint-artifact-init
description: "Initialize Sprint Artifact project config (folder ID, year, default backlog folder)."
---

Initialize Sprint Artifact project configuration.

## Steps

1. Ask the user for the **folderId** (required): the root SprintArtifacts Google Drive folder ID
2. Call `list_folders` MCP tool to get available year folders from Drive
3. Ask the user to select **year** from the available years (e.g., "2026")
4. Call `list_folders` MCP tool again to get subfolders for the selected year
5. Ask the user to select **defaultFolderId** from the subfolders (e.g., Backlogs, Sprint 1)
6. Call `init_project` MCP tool with all values:
   ```
   init_project(folderId, year, defaultFolderId)
   ```

Config is saved to `.sprint-artifact/config.json`.

## Notes
- User must be logged in first (`sprint-artifact login`)
- If user already provides all values (folderId, year, defaultFolderId), skip the interactive steps and call `init_project` directly
- `year` defaults to current year if omitted
- `defaultFolderId` is optional
