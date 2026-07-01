---
name: sprint-artifact-push
description: "Push .planning/ files to active task in Google Drive. Auto-syncs after push."
---

Upload .planning/ files to active task in Google Drive. Auto-syncs after push.

## Steps

1. Ensure active task is selected (call select_task first)
2. Call `push_files` with optional subfolder:
   - "01. Business Requirement Documents"
   - "02. Technical Documents"
   - "03. Testing Documents"
   - "04. User Acceptance Test Documents"
   - "05. Guide Documents"
   - Omit for interactive selection

Auto-syncs after push.
