# AGENTS

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

The project employs a sophisticated, modular architecture that separates concerns across different applications and packages, enabling independent development, deployment, and scaling.

### Core Components

The project is divided into four main applications:

1.  **`apps/web` - Standalone Frontend SPA**
    *   **Description**: A pure client-side application built with React, Vite, and TypeScript. It can be deployed independently as a static website and is fully functional on its own.
    *   **UI/Design**: Features a modern, interactive, and user-centric UI. It utilizes a "Glassmorphic Depth Design System" for components like modals, toasts, and floating panels, creating a sense of visual hierarchy through layered transparency and subtle color accents. The design is geared towards a rich end-user experience for photo browsing and visualization.
    *   **Server Integration**: It can operate in two modes:
        *   **Standalone**: Functions without a server, using a pre-built `photos-manifest.json` file.
        *   **Server-Connected**: When a global variable like `window.__MANIFEST__` is detected, it unlocks enhanced features. This injection is handled by either `apps/ssr` (from a static file) or `be/apps/core` (from the database).

2.  **`apps/ssr` - Next.js Wrapper for SEO & Prerendering**
    *   **Description**: A Next.js application that acts as a transparent proxy for the `apps/web` SPA. Its primary role is to enhance the frontend with server-side capabilities for performance and discoverability, rather than serving as a full-fledged backend. It injects the manifest from a static JSON file.
    *   **Key Features**:
        *   **OG (Open Graph) Rendering**: Dynamically generates social media preview cards for shared links.
        *   **SEO Metadata Injection**: Injects dynamic SEO tags into the HTML for better search engine visibility.
        *   **SSR for Shared Pages**: Server-renders specific pages to provide fast initial load times.

- **`be/apps/core`**: The complete backend server (Hono) for real-time data. For a detailed breakdown of its architecture, see `be/apps/core/AGENTS.md`.
- **`be/apps/dashboard`**: The administration panel for the backend. See `be/apps/dashboard/AGENTS.md` for UI guidelines.

### Monorepo Structure

This is a pnpm workspace with multiple applications and packages:

- `apps/web/` - Main frontend React application (Vite + React 19 SPA).
- `apps/ssr/` - Next.js 15 application serving as an SPA host and dynamic SEO/OG generator.
- `be/apps/core/` - The complete backend server (Hono) for real-time data.
- `be/apps/dashboard/` - The administration panel for the backend.
- `packages/builder/` - Photo processing and manifest generation tool.
- `packages/webgl-viewer/` - High-performance WebGL-based photo viewer component.
- `packages/data/` - Shared data access layer and PhotoLoader singleton.
- `packages/components/` - Reusable UI components shared across apps.
- `packages/ui/` - Core UI elements and design system components.
- `packages/hooks/` - Shared React hooks.
- `packages/utils/` - Utility functions.

### Next.js as SPA Host & SEO Provider

**Dual Server Architecture (for `apps/ssr`)**:

- **Development Mode**: `apps/ssr/src/app/[...all]/route.ts` catches all SPA routes and serves `index.html` with injected manifest data from the static JSON file.
- **Production Mode**: Next.js serves pre-built Vite SPA assets while providing dynamic OG image generation.

**Dynamic SEO Implementation**:

- `apps/ssr/src/index.html.ts` - Pre-compiled HTML template with manifest data injected as `window.__MANIFEST__`.
- Dynamic OG images generated per photo via Next.js API routes (`/og/[photoId]/route.ts`).
- HTML meta tags dynamically replaced for social media sharing.

### Configuration Architecture

**Two-Layer Configuration System**:

1. **Builder Config** (`builder.config.ts`) - **Infrastructure/Processing Layer**:

   - Controls photo processing, storage connections, and build performance.
   - Handles remote git repository sync for manifest/thumbnails.
   - Configures multi-process/cluster processing for large photo sets.

2. **Site Config** (`site.config.ts` + `config.json`) - **Presentation/Content Layer**:
   ```typescript
   {
     name: "Gallery Name",
     description: "...",
     author: { name: "...", url: "...", avatar: "..." },
     social: { twitter: "...", github: "..." },
     map: ["maplibre"] // Map provider configuration
   }
   ```
   - Controls site branding, author info, social links.
   - Merged with user `config.json`.
   - Consumed by both SPA and SSR/Backend for consistent branding.

### Manifest Generation & Data Flow

**Builder Pipeline** (`packages/builder/src/cli.ts`):

1. **Storage Sync**: Downloads photos from S3/GitHub with incremental change detection.
2. **Format Processing**: HEIC→JPEG, TIFF→web formats, Live Photo detection.
3. **Multi-threaded Processing**: Configurable worker pools or cluster mode for performance.
4. **EXIF & Metadata Extraction**: Camera settings, GPS, Fujifilm recipes, tone analysis.
5. **Thumbnail Generation**: Multiple sizes with blurhash placeholders.
6. **Manifest Serialization**: Generates `photos-manifest.json` with full metadata.
7. **Remote Sync**: Pushes updates to a git repository if configured.

**SPA Data Consumption** (`packages/data/src/index.ts`):

```typescript
class PhotoLoader {
  constructor() {
    this.photos = window.__MANIFEST__.data // Injected via global
    this.cameras = window.__MANIFEST__.cameras
    this.lenses = window.__MANIFEST__.lenses
    // Creates lookup maps and provides data access layer
  }
}
```

**Data Flow Scenarios**:

1.  **Static/SSR Flow**:
    *   Builder generates `photos-manifest.json`.
    *   `apps/ssr` reads the JSON and injects it into the HTML as `window.__MANIFEST__`.
    *   SPA's `PhotoLoader` consumes the global data.
2.  **Full Backend Flow**:
    *   `be/apps/core` fetches data from the database.
    *   It generates the manifest object in memory.
    *   It injects the manifest into the HTML as `window.__MANIFEST__` before serving the page.
    *   SPA's `PhotoLoader` consumes the global data, unaware of the source.

### Key Technologies

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Jotai (state), TanStack Query
- **SSR Layer**: Next.js 15
- **Backend**: Hono, Drizzle ORM, PostgreSQL, tsyringe (for DI)
- **Image Processing**: Sharp, exiftool-vendored, HEIC conversion, blurhash generation
- **Storage**: S3-compatible (AWS/MinIO), GitHub repository storage
- **Build System**: pnpm workspaces, concurrent dev servers, cluster-based processing

### Development Workflow

- **Concurrent Development**: `pnpm dev` runs both SPA (Vite) and SSR (Next.js) servers. Use `pnpm --filter @afilmory/core dev` to run the full backend.
- **Hot Reloading**: SPA changes reflect immediately.
- **Manifest Building**: `pnpm run build:manifest` processes photos and updates the static `photos-manifest.json`.
- **Type Safety**: Shared types between builder, SPA, and servers ensure consistency.
- **Page Structure**: Keep files under `pages/` as thin routing shells; move reusable UI/logic into `modules/<domain>/**`.

### Code Quality Rules

1. Avoid code duplication - extract common types and components.
2. Keep components focused - use hooks and component composition.
3. Follow React best practices - proper Context usage, state management.
4. Use TypeScript strictly - leverage type safety throughout.

### i18n Guidelines

- Use flat keys with `.` separation (e.g., `exif.camera.model`).
- Support pluralization with `_one` and `_other` suffixes.
- Modify English first, then other languages (ESLint auto-removes unused keys).
- **CRITICAL: Avoid nested key conflicts in flat structure.**
  - ❌ WRONG: `"action.tag.mode.and": "AND"` + `"action.tag.mode.and.tooltip": "..."`
  - ✅ CORRECT: `"action.tag.mode.and": "AND"` + `"action.tag.tooltip.and": "..."`
  - Rule: A key cannot be both a string value AND a parent object.

### Testing Strategy

- Check `README.md` and `package.json` scripts for test commands.
- Verify builds work with `pnpm build`.
- Test photo processing with `pnpm run build:manifest`.
- Validate types with `pnpm --filter web type-check`.

## Design System

This project contains multiple web applications with distinct design systems. For specific UI and design guidelines, please refer to the `AGENTS.md` file within each application's directory:

- **`apps/web`**: Contains the "Glassmorphic Depth Design System" for the main user-facing photo gallery. See `apps/web/AGENTS.md` for details.
- **`be/apps/dashboard`**: Contains guidelines for the functional, data-driven UI of the administration panel. See `be/apps/dashboard/AGENTS.md` for details.