---
name: sprint-artifact-move
description: "Move a task folder between Backlogs and Sprint folders. Local folder moves automatically."
---

Move a task folder between Backlogs and Sprint folders. Local folder moves automatically.

## Steps

1. Call `list_folders` to browse source folder
2. Call `list_tasks` to list tasks in the source folder
3. Call `move_to_sprint` with taskFolderId, newParentFolderId
   - Optional: taskName (for local folder rename)

Local folder moves from `.sprint-artifact/backlogs/` to `.sprint-artifact/sprints/`.
