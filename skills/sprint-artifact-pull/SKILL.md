---
name: sprint-artifact-pull
description: "Pull task files from Google Drive to local workspace."
---

Download task files from Google Drive to local.

## Steps

1. Call `list_folders` to browse to find the task
2. Call `list_tasks` to list tasks in chosen folder
3. Call `pull_task` with taskId, taskName, taskType (backlogs|sprints)

Files downloaded to `.sprint-artifact/<type>/<task>/`.
