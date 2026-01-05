<p align="center">
  <img src="https://github.com/Afilmory/assets/blob/main/afilmory-readme-2:1.webp?raw=true" alt="Afilmory" width="100%" />
</p>

# <p align="center">Afilmory</p>

## <p align="center">
<a href="/README.md"><img alt="English" src="https://img.shields.io/badge/English-d9d9d9"></a> <a href="/docs/README.zh_CN.md"><img alt="中文(简体)" src="https://img.shields.io/badge/中文(简体)-d9d9d9"></a>
</p>

Afilmory (/əˈfɪlməri/, "uh-FIL-muh-ree") is a term created for personal photography websites, blending Auto Focus (AF), aperture (light control), film (vintage medium), and memory (captured moments).

A modern photo gallery website built with React + TypeScript, supporting automatic photo synchronization from multiple storage sources (S3, GitHub), featuring high-performance WebGL rendering, masonry layout, EXIF information display, thumbnail generation, and more.

## 🚀 Get Started in Seconds

**👉 [Use the Official SaaS](https://afilmory.art/) - No setup required!**

The easiest way to create your photo gallery is through our hosted service at **[afilmory.art](https://afilmory.art/)**. Sign up, connect your storage, and your gallery is live in minutes—no deployment, no servers, no maintenance.

### Why Use the Official SaaS?

- ✅ **Zero setup** - No configuration, no deployment, no infrastructure management
- ✅ **Live CMS** - Edit photos, titles, and metadata in real-time without rebuilding
- ✅ **Custom domains** - Bind your own domain with DNS verification
- ✅ **Automatic updates** - Always running the latest version with new features
- ✅ **Managed infrastructure** - We handle scaling, backups, and maintenance

[**Get Started Now →**](https://afilmory.art/)

---

### Live Photo Galleries

- https://afilmory.innei.in
- https://gallery.mxte.cc
- https://photography.pseudoyu.com
- https://afilmory.magren.cc

## 🌟 Features

### Core Functionality

- 🖼️ **High-Performance WebGL Image Renderer** - Custom WebGL component with smooth zoom and pan operations
- 📱 **Responsive Masonry Layout** - Powered by Masonic, adapts to different screen sizes
- 🎨 **Modern UI Design** - Built with Tailwind CSS and Radix UI component library
- ⚡ **Incremental Sync** - Smart change detection, processes only new or modified photos
- 🌐 **i18n** - Multi-language support
- 🔗 **OpenGraph** - OpenGraph metadata for social media sharing

### Image Processing

- 🔄 **HEIC/HEIF Format Support** - Automatic conversion of Apple device HEIC format
- 📷 **TIFF Format Support** - Automatic conversion of TIFF format
- 🖼️ **Smart Thumbnail Generation** - Multi-size thumbnails for optimized loading performance
- 📊 **EXIF Information Display** - Complete shooting parameters including camera model, focal length, aperture, etc.
- 🌈 **Blurhash Placeholders** - Elegant image loading experience
- 📱 **Live Photo Support** - Detection and display of iPhone Live Photos
- ☀️ **HDR Image Support** - Display HDR images

### Advanced Features

- 🎛️ **Fujifilm Recipe** - Read and display Fujifilm camera film simulation settings
- 🔍 **Fullscreen Viewer** - Image viewer with gesture support
- 🏷️ **File System Tags** - Auto-generated tags based on file system
- ⚡ **Concurrent Processing** - Multi-process/multi-thread concurrent processing support
- 🗂️ **Multi-Storage Support** - S3, GitHub, and other storage backends
- 📷 **Share Image** - Share image to social media or embed iframe to your website
- 🗺️ **Interactive Map Explorer** - Geographic visualization of photos with GPS coordinates from EXIF data using MapLibre

## 🏗️ Technical Architecture

### Frontend Tech Stack

- **React 19** - Latest React version with Compiler
- **TypeScript** - Complete type safety
- **Vite** - Modern build tool
- **Tailwind CSS** - Atomic CSS framework
- **Radix UI** - Accessible component library
- **Jotai** - State management
- **TanStack Query** - Data fetching and caching
- **React Router 7** - Routing management
- **i18next** - Internationalization

### Build System

- **Node.js** - Server-side runtime
- **Sharp** - High-performance image processing
- **AWS SDK** - S3 storage operations
- **Worker Threads/Cluster** - Concurrent processing
- **EXIF-Reader** - EXIF data extraction

### Storage Architecture

Designed with adapter pattern, supporting multiple storage backends:

- **S3-Compatible Storage** - AWS S3, MinIO, Alibaba Cloud OSS, etc.
- **GitHub Storage** - Using GitHub repository as image storage
- **Eagle Storage** - Using Eagle app library as image storage
- **Local File System** - Local storage for development and testing

## 🛠️ Self-Host (Advanced)

If you prefer to host Afilmory yourself, you can deploy it on your own infrastructure. This requires more technical knowledge and ongoing maintenance.

> **💡 Tip**: For most users, we recommend using the [official SaaS](https://afilmory.art/) instead. Self-hosting is best suited for developers who need full control over their deployment or have specific infrastructure requirements.

### Option A: Docker (recommended)

[Docker deployment guide](https://github.com/Afilmory/docker) ships prebuilt images with minimal setup.

### Option B: Manual install

1. Copy `config.example.json` to `config.json` and fill in your site name, description, and social links.
2. Prepare access to your photo storage (S3/B2/GitHub/local). The builder will read photos and generate thumbnails plus `photos-manifest.json`.
3. Run the builder to generate assets, then start the site.

Looking for developer commands, environment variables, and builder config details? See `DEVELOPMENT.md`.

For detailed self-hosting instructions, see the [Documentation](https://docs.afilmory.art).

## 🔧 Advanced Usage

### Custom Storage Provider

Implement the `StorageProvider` interface to support new storage backends:

```typescript
import { StorageProvider } from './src/core/storage/interfaces'

class MyStorageProvider implements StorageProvider {
  async getFile(key: string): Promise<Buffer | null> {
    // Implement file retrieval logic
  }

  async listImages(): Promise<StorageObject[]> {
    // Implement image list retrieval logic
  }

  // ... other methods
}
```

### Custom Image Processing

Add custom processors in the `src/core/image/` directory:

```typescript
export async function customImageProcessor(buffer: Buffer) {
  // Custom image processing logic
  return processedBuffer
}
```

## 📄 License

Attribution Network License (ANL) v1.0 © 2025 Afilmory Team. See [LICENSE](LICENSE) for more details.

## 📚 Documentation

- **[Official Documentation](https://docs.afilmory.art/)** - Complete guides, API reference, and tutorials
- **[Quick Start Guide](https://docs.afilmory.art/getting-started/quick-start)** - Get your gallery running in 5 minutes
- **[SaaS Mode](https://docs.afilmory.art/saas)** - Learn about hosted galleries and multi-tenant features
- **[Storage Providers](https://docs.afilmory.art/storage/providers)** - Setup guides for S3, GitHub, B2, and more
- **[Deployment Guides](https://docs.afilmory.art/deployment)** - Deploy to Vercel, Cloudflare Pages, Docker, and more

## 🔗 Related Links

- [Official SaaS](https://afilmory.art/) 
- [Personal Website](https://innei.in)
- [GitHub](https://github.com/innei)

---

If this project helps you, please give it a ⭐️ Star for support!
