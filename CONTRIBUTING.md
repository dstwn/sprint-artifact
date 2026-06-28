# Contributing

Terima kasih atas kontribusi Anda! Berikut panduan untuk berkontribusi di project ini.

## Development Setup

```bash
# Clone repository
git clone https://github.com/dstwn/sprint-artifact.git
cd sprint-artifact

# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev
```

## Project Structure

```
src/
├── sdk/           # Core SDK dengan Google Drive integration
├── cli/           # CLI commands
├── mcp/           # MCP server
├── types/         # TypeScript types
└── utils/         # Config & OAuth2 utilities
```

## Commands

```bash
npm run build    # Build TypeScript
npm run dev      # Watch mode
npm run lint     # Lint code
npm run format   # Format code
npm test         # Run tests
```

## Pull Request

1. Fork repository
2. Buat branch baru (`git checkout -b feature/awesome-feature`)
3. Commit perubahan (`git commit -m 'feat: add awesome feature'`)
4. Push ke branch (`git push origin feature/awesome-feature`)
5. Buat Pull Request

## Commit Convention

Gunakan [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - Fitur baru
- `fix:` - Bug fix
- `docs:` - Dokumentasi
- `style:` - Formatting
- `refactor:` - Refactoring
- `test:` - Tests
- `chore:` - Maintenance

## Code Style

- Gunakan TypeScript strict mode
- Ikuti ESLint rules
- Format dengan Prettier
- Jangan commit secrets/credentials

## Reporting Issues

Buat issue di [GitHub Issues](https://github.com/dstwn/sprint-artifact/issues) dengan:

- Deskripsi jelas
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Node version)
