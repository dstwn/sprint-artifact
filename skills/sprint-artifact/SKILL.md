---
name: sprint-artifact
description: "Manage sprint artifacts (backlogs, tasks, documents) with Google Drive. Overview of all commands and MCP tools."
---

Manage sprint artifacts (backlogs, tasks, documents) with Google Drive integration.

## Available Commands

|`/sprint-artifact-init`|Initialize project config|
|`/sprint-artifact-select`|Browse folders, pick task, auto-pull to local|
|`/sprint-artifact-backlog-create`|Create backlog with 5-subfolder structure|
|`/sprint-artifact-pull`|Pull task files from Drive to local|
|`/sprint-artifact-push`|Push .planning/ files to active task in Drive|
|`/sprint-artifact-sync`|Bidirectional sync for active task|
|`/sprint-artifact-move`|Move task between Backlogs and Sprint folders|
|`/sprint-artifact-status`|Show project config and active task|

## MCP Tools

|`list_folders`|List year folders or subfolders|
|`list_tasks`|List tasks in a folder|
|`init_project`|Initialize project config|
|`backlog_create`|Create backlog with subfolder structure|
|`select_task`|Select active task and auto-pull|
|`pull_task`|Pull task from Drive to local|
|`push_files`|Push .planning/ to active task|
|`sync_documents`|Bidirectional sync|
|`move_to_sprint`|Move task folder between Backlogs/Sprints|
|`status`|Show config and active task|

## Folder Structure

```
SprintArtifacts/ → YYYY/ → Backlogs|Sprints/ → ID-Title/ → 01..05 subfolders
```

Local workspace: `.sprint-artifact/backlogs|sprints/<task>/`
Push source: `.planning/`
