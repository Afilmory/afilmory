<p align="center">
  <img src="https://github.com/Afilmory/assets/blob/main/afilmory-readme-2:1.webp?raw=true" alt="Afilmory" width="100%" />
</p>

# <p align="center">Afilmory</p>

<p align="center">
  <em>A modern, high-performance photo gallery platform for photographers</em>
</p>

<p align="center">
  <a href="https://afilmory.art/">Official SaaS</a> •
  <a href="https://docs.afilmory.art/">Documentation</a> •
  <a href="#-live-galleries">Live Examples</a> •
  <a href="#-self-hosting">Self-Hosting</a>
</p>

<p align="center">
  <a href="https://testflight.apple.com/join/ywnq5mns">
    <img src="https://gist.githubusercontent.com/lexrus/eadc04582835d9f16ea4d4448d0e8b2c/raw/b8d0af68ca4be55fcc59876cec05de4206e0f191/available-on-testflight.svg" alt="Available on TestFlight" width="333" />
  </a>
</p>

---

**Afilmory** (/əˈfɪlməri/, "uh-FIL-muh-ree") is a comprehensive photo gallery solution that combines **Auto Focus (AF)**, **Aperture** (light control), **Film** (vintage medium), and **Memory** (captured moments). Built with React + TypeScript, it offers automatic photo synchronization from multiple storage sources, a GPU-accelerated image viewer (WebGPU first, WebGL fallback) with HDR gain-map support, professional EXIF metadata display, and a native iOS companion app.

## 🚀 Quick Start

### Option 1: Official SaaS (Recommended)

**👉 [Get Started at afilmory.art](https://afilmory.art/)** - Zero setup, live in minutes!

The easiest way to create your photo gallery. No deployment, no servers, no maintenance required.

**Why Choose SaaS?**
- ✅ **Zero Configuration** - Sign up and go live immediately
- ✅ **Live CMS** - Edit photos, titles, and metadata in real-time
- ✅ **Custom Domains** - Bind your own domain with DNS verification
- ✅ **Auto Updates** - Always running the latest features
- ✅ **Managed Infrastructure** - We handle scaling, backups, and maintenance

[**Start Your Gallery Now →**](https://afilmory.art/)

### Option 2: Self-Hosting

For developers who need full control over their deployment:

**Docker (Recommended)**
```bash
# See our Docker deployment guide
https://github.com/Afilmory/docker
```

**Manual Installation**
```bash
# 1. Clone and install
git clone https://github.com/Afilmory/Afilmory.git
cd Afilmory
pnpm install

# 2. Configure
cp config.example.json config.json
cp builder.config.default.ts builder.config.ts
# Edit both files with your settings

# 3. Build manifest and thumbnails
pnpm run build:manifest

# 4. Start the application
pnpm dev
```

For detailed self-hosting instructions, see [DEVELOPMENT.md](./DEVELOPMENT.md) and [Documentation](https://docs.afilmory.art).

## 📸 Live Galleries

See Afilmory in action:

- [afilmory.innei.in](https://afilmory.innei.in) - Creator's personal gallery
- [gallery.mxte.cc](https://gallery.mxte.cc)
- [photography.pseudoyu.com](https://photography.pseudoyu.com)
- [afilmory.magren.cc](https://afilmory.magren.cc)

## ✨ Features

### Core Capabilities

- 🖼️ **WebGPU Image Viewer** - Custom GPU viewer that renders through WebGPU by default and falls back to WebGL when `navigator.gpu` is unavailable; smooth zoom, pan, pinch, and double-tap cycling between fit, fill, and 100%
- 🧩 **Tiled Rendering** - Large photos are decoded off the main thread in a worker and streamed to the GPU as tiles
- 📱 **Responsive Masonry Layout** - Powered by Masonic, adapts seamlessly to any screen size
- 🎨 **Modern UI/UX** - Tailwind CSS 4 with the Apple UIKit color palette, glass materials, and spring motion
- ⚡ **Incremental Sync** - Smart change detection processes only new or modified photos
- 🌐 **Internationalization** - English, 简体中文, 繁體中文 (HK/TW), 日本語, and 한국어
- 🔗 **Social Sharing** - Dynamic OpenGraph images and SEO metadata for rich previews
- 📲 **Native iOS App** - Swift/UIKit client for browsing galleries, with push notifications

### Image Processing

- 🔄 **Format Support** - Automatic conversion of HEIC/HEIF, TIFF, and BMP
- 🖼️ **Smart Thumbnails** - Multi-size thumbnail generation for optimized loading
- 📊 **Complete EXIF Display** - Camera, lens, focal length, aperture, ISO, GPS, and more (via ExifTool)
- 🌈 **ThumbHash Placeholders** - Compact placeholders for a smooth progressive loading experience
- 📱 **Live Photos** - Detection and playback of iPhone Live Photos
- ☀️ **HDR Gain Maps** - Renders JPEG gain-map HDR (including Apple HDR photos) on HDR-capable displays
- 🎛️ **Fujifilm Recipes** - Display Fujifilm film simulation settings

### Advanced Features

- 🗂️ **Multi-Storage Support** - S3-compatible storage, Backblaze B2, GitHub, Eagle, and local file system
- 🏷️ **File System Tags** - Auto-generated tags based on directory structure
- ⚡ **Concurrent Processing** - Worker-thread and cluster modes for fast builds
- 🔌 **Builder Plugins** - Lifecycle hooks for thumbnail storage, reverse geocoding, repo sync, and custom logic
- 🗺️ **Interactive Map** - Geographic visualization with GPS coordinates using MapLibre
- 💬 **Comments & Reactions** - Visitor engagement in backend-powered galleries
- 📷 **Share & Embed** - Share images to social media or embed them via the SDK

## 🏗️ Architecture

### Monorepo Structure

```
afilmory/
├── apps/
│   ├── web/              # Gallery SPA (Vite + React 19 + React Router 7)
│   ├── ssr/              # Next.js host: serves the SPA, injects manifest, OG/SEO
│   ├── mobile/           # Native iOS app (Swift / UIKit, XcodeGen)
│   ├── site/             # Marketing site (Astro)
│   ├── docs/             # Documentation site (Vite + MDX)
│   └── promo/            # Promo videos (Remotion)
├── be/                   # Backend services
│   ├── apps/
│   │   ├── core/         # Core API server (Hono + @tsuki-hono)
│   │   ├── dashboard/    # Admin dashboard SPA
│   │   └── oauth-gateway/# Standalone OAuth broker
│   └── packages/
│       ├── db/           # Database schemas & migrations (Drizzle ORM)
│       ├── redis/        # Redis client
│       ├── task-queue/   # Job queue
│       └── utils/        # Shared backend utilities
├── packages/
│   ├── builder/          # Photo processing pipeline CLI
│   ├── webgl-viewer/     # GPU image viewer (WebGPU + WebGL fallback)
│   ├── viewer-motion/    # Framework-agnostic viewer motion primitives
│   ├── renderer/         # OG image renderer (Satori + resvg)
│   ├── data/             # PhotoLoader + bundled manifest
│   ├── typing/           # Shared photo/manifest types
│   ├── sdk/              # Public SDK + share embed script
│   ├── ui/               # Shared UI components
│   ├── hooks/            # React hooks library
│   └── utils/            # Utility functions
└── plugins/              # ESLint / Vite tooling plugins
```

### Frontend Stack

- **React 19** - With the React Compiler
- **TypeScript 6** - Full type safety
- **Vite 8** - Lightning-fast build tool
- **React Router 7** - File-based routing
- **Tailwind CSS 4** - Utility-first CSS with the Apple UIKit color palette
- **Radix UI / Headless UI** - Accessible component primitives
- **Motion** - Spring-based animations
- **Jotai** - Atomic state management
- **TanStack Query** - Data fetching and caching
- **MapLibre GL** - Interactive maps
- **i18next** - Internationalization

### Image Viewer

- **WebGPU** - Primary renderer, with worker-side texture decoding and tiled uploads
- **WebGL** - Automatic fallback for browsers without WebGPU
- **HDR Gain Maps** - JPEG gain-map parsing and HDR compositing on `dynamic-range: high` displays

### SSR Host

- **Next.js 16** - Serves the SPA, injects the manifest, and renders dynamic OG images and SEO metadata

### Backend Stack

- **Hono** - Ultra-fast web framework
- **@tsuki-hono** - NestJS-style modules, controllers, and decorators on top of Hono, with `tsyringe` DI
- **Drizzle ORM** - Type-safe database toolkit
- **PostgreSQL** - Primary database
- **Redis** - Caching and task queue
- **Better Auth** - Authentication
- **Server-Sent Events** - Real-time updates
- **Satori + resvg** - OG image rendering

### Mobile

- **Swift 6 / UIKit** - Native iOS 18+ app, with Liquid Glass on newer iOS versions
- **XcodeGen** - `project.yml` as the project source of truth

### Build Pipeline

- **Node.js** - Server-side runtime
- **Sharp** - High-performance image processing
- **ExifTool** - Metadata extraction (via `exiftool-vendored`)
- **ThumbHash** - Placeholder generation
- **AWS SDK** - S3 storage operations
- **Worker Threads / Cluster** - Parallel processing

### Storage Adapters

Designed with adapter pattern for flexibility:

- **S3-Compatible** - AWS S3, MinIO, RustFS, Alibaba Cloud OSS, and more
- **Backblaze B2** - Native B2 API provider
- **GitHub** - Use GitHub repository as storage
- **Eagle** - Import from Eagle app library
- **Local File System** - For development and testing

## 🛠️ Development

### Prerequisites

- Node.js (current LTS)
- pnpm 11+
- Xcode 16+ (only for the iOS app)

### Project Setup

```bash
# Install dependencies
pnpm install

# Copy configuration files
cp config.example.json config.json
cp builder.config.default.ts builder.config.ts

# Set up environment variables
cp .env.template .env
# Edit .env with your credentials
```

### Common Commands

```bash
# Development
pnpm dev                    # Start web + SSR
pnpm dev:be                 # Start backend services
pnpm --filter web dev       # Web app only
pnpm --filter @afilmory/ssr dev  # SSR only
pnpm --filter @afilmory/dashboard dev  # Admin dashboard
pnpm dev:mobile             # Build and run the iOS app in Simulator
pnpm site:dev               # Marketing site

# Build
pnpm build                  # Build production web app
pnpm build:manifest         # Generate photo manifest (incremental)
pnpm build:manifest -- --force  # Full rebuild
pnpm build:manifest -- --force-manifest    # Regenerate manifest only
pnpm build:manifest -- --force-thumbnails  # Regenerate thumbnails only

# Documentation
pnpm docs:dev               # Start docs dev server
pnpm docs:build             # Build documentation

# Code Quality
pnpm lint                   # Lint and fix
pnpm format                 # Format code
pnpm type-check             # Type checking
```

### Configuration Files

**`config.json`** - Site presentation config:
```json
{
  "name": "My Gallery",
  "title": "My Photography",
  "description": "Capturing beautiful moments",
  "url": "https://gallery.example.com",
  "accentColor": "#007bff",
  "author": {
    "name": "Your Name",
    "url": "https://example.com",
    "avatar": "https://example.com/avatar.jpg"
  },
  "social": {
    "github": "username",
    "twitter": "username"
  },
  "map": ["maplibre"],
  "mapStyle": "builtin",
  "mapProjection": "mercator"
}
```

**`builder.config.ts`** - Photo processing config:
```typescript
import { defineBuilderConfig } from '@afilmory/builder'

export default defineBuilderConfig(() => ({
  storage: {
    provider: 's3',
    bucket: 'my-photos',
    region: 'us-east-1',
    // ... other S3 settings
  },
  system: {
    processing: {
      defaultConcurrency: 10,
      enableLivePhotoDetection: true,
    },
    observability: {
      showProgress: true,
      showDetailedStats: true,
    },
  },
}))
```

## 🔌 Extending Afilmory

### Custom Storage Provider

Implement the `StorageProvider` interface:

```typescript
import type { StorageProvider, StorageObject } from '@afilmory/builder'

class MyStorageProvider implements StorageProvider {
  async getFile(key: string): Promise<Buffer | null> {
    // Your implementation
  }

  async listImages(): Promise<StorageObject[]> {
    // Your implementation
  }

  // ... other required methods
}
```

### Custom Builder Plugin

Create a plugin that hooks into the build lifecycle:

```typescript
import type { BuilderPlugin } from '@afilmory/builder'

export default function myPlugin(): BuilderPlugin {
  return {
    name: 'my-plugin',
    hooks: {
      beforeBuild: async ({ logger }) => {
        logger.main.info('Starting build')
      },
      afterSaveManifest: async ({ payload }) => {
        // payload.manifest, payload.cameras, payload.lenses
      },
    },
  }
}
```

Register it in `builder.config.ts` under `plugins`.

## 📚 Documentation

- **[Official Documentation](https://docs.afilmory.art/)** - Complete guides and API reference
- **[Quick Start Guide](https://docs.afilmory.art/getting-started/quick-start)** - Get running in 5 minutes
- **[SaaS Mode](https://docs.afilmory.art/saas)** - Learn about hosted galleries
- **[Storage Providers](https://docs.afilmory.art/storage/providers)** - Setup guides for all storage options
- **[Deployment Guides](https://docs.afilmory.art/deployment)** - Deploy to various platforms
- **[API Reference](https://docs.afilmory.art/api)** - Backend API documentation

## 🤝 Contributing

We welcome contributions! See [AGENTS.md](./AGENTS.md) for architecture notes and [DESIGN.md](./DESIGN.md) for the web design system.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting and type checks (`pnpm lint && pnpm type-check`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

Attribution Network License (ANL) v1.0 © 2025 Afilmory Team

See [LICENSE](./LICENSE) for more details.

## 🔗 Links

- **[Official SaaS](https://afilmory.art/)** - Hosted gallery service
- **[Documentation](https://docs.afilmory.art/)** - Full documentation
- **[GitHub](https://github.com/Afilmory/Afilmory)** - Source code
- **[Creator's Website](https://innei.in)** - Project creator

## 🙏 Acknowledgments

Built with love by the Afilmory team and contributors. Special thanks to all photographers using Afilmory to share their work with the world.

---

<p align="center">
  If this project helps you, please give it a ⭐️ Star!
</p>
