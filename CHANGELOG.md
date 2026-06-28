# Changelog

All notable changes to this project will be documented in this file.

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
