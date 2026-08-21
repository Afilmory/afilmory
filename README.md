<p align="center">
  <img src="./docs/assets/afilmory-readme.webp" alt="Afilmory" width="100%" />
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

**Afilmory** (/əˈfɪlməri/, "uh-FIL-muh-ree") is a comprehensive photo gallery solution that combines **Auto Focus (AF)**, **Aperture** (light control), **Film** (vintage medium), and **Memory** (captured moments). Built with React + TypeScript, it offers automatic photo synchronization from multiple storage sources, high-performance WebGL rendering, and professional EXIF metadata display.

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

- 🖼️ **High-Performance WebGL Renderer** - Custom WebGL image viewer with smooth zoom, pan, and gesture support
- 📱 **Responsive Masonry Layout** - Powered by Masonic, adapts seamlessly to any screen size
- 🎨 **Modern UI/UX** - Built with Tailwind CSS and Radix UI for accessibility and aesthetics
- ⚡ **Incremental Sync** - Smart change detection processes only new or modified photos
- 🌐 **Internationalization** - Multi-language support with i18next
- 🔗 **Social Sharing** - OpenGraph metadata for rich social media previews

### Image Processing

- 🔄 **Format Support** - Automatic conversion of HEIC/HEIF and TIFF formats
- 🖼️ **Smart Thumbnails** - Multi-size thumbnail generation for optimized loading
- 📊 **Complete EXIF Display** - Camera model, focal length, aperture, ISO, and more
- 🌈 **Blurhash Placeholders** - Elegant progressive loading experience
- 📱 **Live Photos** - Detection and display of iPhone Live Photos
- ☀️ **HDR Images** - Full HDR image support
- 🎛️ **Fujifilm Recipes** - Display Fujifilm film simulation settings

### Advanced Features

- 🗂️ **Multi-Storage Support** - S3-compatible storage, GitHub, Eagle, and local file system
- 🏷️ **File System Tags** - Auto-generated tags based on directory structure
- ⚡ **Concurrent Processing** - Multi-process/multi-thread support for fast builds
- 🗺️ **Interactive Map** - Geographic visualization with GPS coordinates using MapLibre
- 🔍 **Fullscreen Viewer** - Immersive image viewing with gesture controls
- 📷 **Share & Embed** - Share images to social media or embed in your website

## 🏗️ Architecture

### Monorepo Structure

```
afilmory/
├── apps/
│   ├── web/              # React SPA (Vite + React Router 7)
│   ├── ssr/              # Next.js SSR wrapper for SEO/OG
│   ├── docs/             # Documentation site (VitePress)
├── be/                   # Backend services (Hono-based)
│   ├── apps/
│   │   ├── core/         # Core API server
│   │   ├── dashboard/    # Admin dashboard backend
│   │   └── oauth-gateway/# OAuth authentication gateway
│   └── packages/
│       ├── framework/    # Hono enterprise framework
│       ├── db/           # Database schemas (Drizzle ORM)
│       ├── redis/        # Redis client
│       └── websocket/    # WebSocket gateway
├── packages/
│   ├── builder/          # Photo processing pipeline
│   ├── webgl-viewer/     # WebGL image viewer component
│   ├── ui/               # Shared UI components
│   ├── hooks/            # React hooks library
│   ├── sdk/              # API client SDK
│   ├── utils/            # Utility functions
│   └── data/             # Shared data types
└── plugins/              # Builder plugins
```

### Frontend Stack

- **React 19** - Latest React with Compiler
- **TypeScript** - Full type safety
- **Vite** - Lightning-fast build tool
- **React Router 7** - Modern routing
- **Tailwind CSS** - Utility-first CSS framework
- **Radix UI** - Accessible component primitives
- **Jotai** - Atomic state management
- **TanStack Query** - Data fetching and caching
- **i18next** - Internationalization

### Backend Stack

- **Hono** - Ultra-fast web framework
- **Drizzle ORM** - Type-safe database toolkit
- **PostgreSQL** - Primary database
- **Redis** - Caching and pub/sub
- **WebSocket** - Real-time communication

### Build Pipeline

- **Node.js** - Server-side runtime
- **Sharp** - High-performance image processing
- **AWS SDK** - S3 storage operations
- **Worker Threads/Cluster** - Parallel processing
- **EXIF-Reader** - Metadata extraction

### Storage Adapters

Designed with adapter pattern for flexibility:

- **S3-Compatible** - AWS S3, MinIO, Backblaze B2, Alibaba Cloud OSS
- **GitHub** - Use GitHub repository as storage
- **Eagle** - Import from Eagle app library
- **Local File System** - For development and testing

## 🛠️ Development

### Prerequisites

- Node.js 18+
- pnpm 10+
- TypeScript 5.9+

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

# Build
pnpm build                  # Build production web app
pnpm build:manifest         # Generate photo manifest (incremental)
pnpm build:manifest -- --force  # Full rebuild

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
import { StorageProvider } from '@afilmory/builder'

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

Create a plugin for the build pipeline:

```typescript
import { BuilderPlugin } from '@afilmory/builder'

export const myPlugin = (): BuilderPlugin => ({
  name: 'my-plugin',
  async onBeforeBuild(context) {
    // Pre-build hook
  },
  async onAfterBuild(context) {
    // Post-build hook
  },
})
```

## 📚 Documentation

- **[Official Documentation](https://docs.afilmory.art/)** - Complete guides and API reference
- **[Quick Start Guide](https://docs.afilmory.art/getting-started/quick-start)** - Get running in 5 minutes
- **[SaaS Mode](https://docs.afilmory.art/saas)** - Learn about hosted galleries
- **[Storage Providers](https://docs.afilmory.art/storage/providers)** - Setup guides for all storage options
- **[Deployment Guides](https://docs.afilmory.art/deployment)** - Deploy to various platforms
- **[API Reference](https://docs.afilmory.art/api)** - Backend API documentation

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`pnpm test && pnpm lint`)
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
