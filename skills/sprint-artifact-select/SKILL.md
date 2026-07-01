---
name: sprint-artifact-select
description: "Browse Google Drive folders and select an active task. Auto-pulls to local workspace."
---

Browse and select a task to work on. Auto-pulls to local.

## Steps

1. Call `list_folders` to browse year folders and subfolders
2. Call `list_tasks` with chosen folderId to list tasks
3. Call `select_task` with taskName, taskId, taskType (backlogs|sprints)

Task is auto-pulled to `.sprint-artifact/<type>/<task>/`.
