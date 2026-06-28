# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] - 2026-06-28

### Added
- `select` sekarang 2 langkah: pilih folder dulu, baru pilih task
- `select` otomatis pull task ke local setelah dipilih

### Changed
- `select` tidak lagi list semua task sekaligus, tapi per folder
- Workflow lebih simpel: select = select + pull

## [0.4.0] - 2026-06-28

### Added
- `select` command - pilih active task (interactive, tersimpan di config)
- `push --tech-docs` command - push file dari `.planning/` ke `02. Technical Documents/`
- `pull` command - pull task dari Google Drive ke local (interactive)
  - `--backlog` - pull dari Backlogs folder
  - `--sprint <name>` - pull dari Sprint folder
- `selectedTaskId` dan `selectedTaskFolderId` di config

### Changed
- `select` sekarang interactive dengan list task dari Google Drive
- `pull` sekarang menyimpan ke `.sprint-artifact/backlogs/` atau `.sprint-artifact/sprints/`

## [0.3.0] - 2026-06-28

### Added
- Interactive year selection from Google Drive folders
- Interactive folder selection during init
- Backlog create with folder structure (5 subfolders)
- Shared Drive support (`supportsAllDrives`)
- Curl fallback for API calls (fix node-fetch issues)
- Default folder saved in config

### Changed
- `backlog create` requires `--id` and `--title` (removed `--description`, `--priority`)
- `init` now asks for year and default folder interactively
- Google Drive client uses native fetch + curl fallback

### Fixed
- OAuth2 token exchange using curl fallback
- Network timeout issues with node-fetch
- Shared Drive file creation

## [0.2.0] - 2026-06-28

### Added
- OAuth2 login command dengan auto-detect credentials
- Global credentials storage (`~/.sprint-artifact/credentials.json`)
- CLI commands: init, login, backlog, sync, status, select, sprint
- MCP server dengan tools: backlog_create, sync_documents, move_to_sprint, status, select_task
- Core SDK dengan Google Drive integration
- TypeScript types dan JSON schemas

### Security
- Credentials files di-gitignore secara default
- OAuth2 flow dengan local callback server

## [0.1.0] - 2026-06-28

### Added
- Initial project structure
- Documentation dan specifications
