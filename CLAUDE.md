# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development Commands
```bash
# Start development server (runs both web and SSR)
pnpm dev

# Start only web development server
pnpm --filter web dev

# Start only SSR development server
pnpm --filter @afilmory/ssr dev

# Build production version
pnpm build

# Build manifest from storage (generates photo metadata)
pnpm run build:manifest

# Force rebuild all photos and metadata
pnpm run build:manifest -- --force

# Force regenerate thumbnails only
pnpm run build:manifest -- --force-thumbnails

# Force regenerate manifest only
pnpm run build:manifest -- --force-manifest
```

### Database Commands (SSR app)
```bash
# Generate database migrations
pnpm --filter @afilmory/ssr db:generate

# Run database migrations
pnpm --filter @afilmory/ssr db:migrate
```

### Code Quality Commands
```bash
# Lint and fix code
pnpm lint

# Format code
pnpm format

# Type check (web app)
pnpm --filter web type-check
```

## Architecture

### Monorepo Structure
This is a pnpm workspace with multiple applications and packages:

- `apps/web/` - Main frontend React application (Vite + React 19)
- `apps/ssr/` - Next.js SSR application for server-side rendering and APIs
- `packages/` - Shared packages and utilities
- `packages/builder/` - Photo processing and manifest generation tool
- `packages/webgl-viewer/` - WebGL-based photo viewer component

### Key Technologies
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Jotai (state), TanStack Query
- **Backend**: Next.js 15, Drizzle ORM, PostgreSQL
- **Image Processing**: Sharp, EXIF extraction, WebGL rendering
- **Storage**: S3-compatible storage, GitHub storage support
- **Build Tools**: pnpm workspaces, ESLint, Prettier

### Configuration Files
- `builder.config.json` - Photo processing and storage configuration
- `config.json` - Site configuration (name, description, author, etc.)
- `site.config.ts` - TypeScript site configuration with defaults
- `env.ts` - Environment variables validation and types

### Photo Processing Pipeline
1. **Storage Sync**: Fetches photos from configured storage (S3/GitHub)
2. **Format Conversion**: Converts HEIC, TIFF to web-compatible formats
3. **Thumbnail Generation**: Creates multiple sizes for performance
4. **EXIF Extraction**: Extracts camera settings and GPS data
5. **Manifest Generation**: Creates `photos-manifest.json` with metadata

### Development Workflow
- Web app runs on development server with hot reload
- SSR app provides APIs and server-side rendering
- Builder tool processes photos and generates metadata
- Database migrations handle schema changes

### Code Quality Rules
1. Avoid code duplication - extract common types and components
2. Keep components focused - use hooks and component composition
3. Follow React best practices - proper Context usage, state management
4. Use TypeScript strictly - leverage type safety throughout

### i18n Guidelines
- Use flat keys with `.` separation (e.g., `exif.camera.model`)
- Support pluralization with `_one` and `_other` suffixes
- Modify English first, then other languages (ESLint auto-removes unused keys)
- Avoid nested key conflicts in flat structure

### Testing Strategy
- Check README.md and package.json scripts for test commands
- Verify builds work with `pnpm build`
- Test photo processing with `pnpm run build:manifest`
- Validate types with `pnpm --filter web type-check`

## Cursor Rules Integration

### Code Quality Standards
- Avoid code duplication - extract common types and components when used multiple times
- Keep components focused - use hooks and component splitting for large logic blocks
- Master React philosophy - proper Context usage, component composition, state management to prevent re-renders

### UI/UX Guidelines
- Use Apple UIKit color system via tailwind-uikit-colors package
- Prefer semantic color names: `text-primary`, `fill-secondary`, `material-thin`, etc.
- Follow system colors: `red`, `blue`, `green`, `mint`, `teal`, `cyan`, `indigo`, `purple`, `pink`, `brown`, `gray`
- Use material design principles with opacity-based fills and proper contrast

### i18n Development Rules
- Use flat keys with dot notation: `exif.camera.model`
- Support pluralization: `_one` and `_other` suffixes
- Always modify English (`en.json`) first, then other languages
- Avoid key conflicts in flat structure (e.g., `exif.custom.rendered` vs `exif.custom.rendered.custom`)
- ESLint automatically removes unused keys from non-English files

## Important Notes
- This is a photo gallery application that processes and displays photos from cloud storage
- The builder tool handles complex image processing workflows
- WebGL viewer provides high-performance photo viewing experience
- Map integration shows photo locations from GPS EXIF data
- Live Photo support for iOS/Apple device videos