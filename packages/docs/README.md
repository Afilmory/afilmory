# @afilmory/docs

A modern documentation site generator built with Vite, React, and MDX. This package provides a file-system based routing documentation site with automatic route generation, syntax highlighting, and responsive design.

## Features

- **File-system based routing** - Automatic route generation from markdown files
- **MDX support** - Write JSX components directly in markdown
- **Syntax highlighting** - Code blocks with Shiki highlighting (light/dark themes)
- **Static site generation** - Build static HTML files for deployment
- **Hot reload** - Real-time updates during development
- **Responsive design** - Built with Tailwind CSS and Apple UIKit colors
- **TypeScript support** - Full type safety throughout the codebase

## Quick Start

### Development

Start the development server:

```bash
pnpm dev
```

This will start the Vite development server and watch for changes in the `contents/` directory.

### Building

Build the documentation site for production:

```bash
pnpm build
```

This runs three steps:

1. `build:client` - Builds the client-side React application
2. `build:static` - Generates static HTML files via SSR
3. `output` - Processes and finalizes the build output

### Preview

Preview the built site locally:

```bash
pnpm preview
```

## Project Structure

```
packages/docs/
├── contents/           # Documentation content (MDX/Markdown files)
│   ├── index.mdx      # Homepage content
│   ├── getting-started.md
│   └── apps/          # Nested documentation sections
├── src/
│   ├── components/    # React components
│   ├── styles/        # CSS and styling
│   ├── routes.ts      # Auto-generated routes (do not edit)
│   └── App.tsx        # Main application component
├── plugins/
│   └── route-generater.ts  # Custom Vite plugin for route generation
├── public/            # Static assets
└── scripts/           # Build scripts
```

## Writing Documentation

### File-based Routing

The documentation follows a file-system based routing convention:

- `contents/index.mdx` → `/` (homepage)
- `contents/getting-started.md` → `/getting-started`
- `contents/apps/index.md` → `/apps` (section index)
- `contents/apps/web.md` → `/apps/web`

### MDX Format

You can use standard Markdown with JSX components:

````mdx
---
title: Page Title
createdAt: 2025-01-20T10:00:00Z
lastModified: 2025-01-20T10:00:00Z
---

# Page Title

Regular markdown content here.

<div className="bg-blue-100 p-4 rounded">Custom JSX component</div>

## Code Examples

```typescript
const example = 'syntax highlighted code'
```
````

````

### Frontmatter

Each documentation file can include frontmatter metadata:

```yaml
---
title: Page Title          # Used for navigation and SEO
createdAt: 2025-01-20     # Creation date
lastModified: 2025-01-20  # Last modification date
description: Page description  # Optional page description
---
````

## Development Guide

### Adding New Content

1. Create a new `.md` or `.mdx` file in the `contents/` directory
2. Add appropriate frontmatter metadata
3. The route will be automatically generated on save
4. The development server will hot-reload with your changes

### Custom Components

Create reusable components in `src/components/` and use them in MDX files:

```typescript
// src/components/InfoBox.tsx
export function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
      {children}
    </div>
  );
}
```

```mdx
<!-- In your MDX file -->

import { InfoBox } from '../src/components/InfoBox'

<InfoBox>This is a custom info box component.</InfoBox>
```

### Styling

The project uses:

- **Tailwind CSS** for utility-first styling
- **Apple UIKit colors** via `tailwindcss-uikit-colors`
- **Typography plugin** for prose styling
- **Custom scrollbar** styling

Use semantic color classes:

```css
/* Preferred */
.text-text-primary .bg-fill-secondary

/* Avoid */
.text-blue-500 .bg-gray-100
```

### Route Generation Plugin

The custom Vite plugin automatically generates routes from the file system:

- Watches the `contents/` directory for changes
- Generates `src/routes.ts` with route definitions
- Creates `src/routes.json` for metadata
- Handles index files and nested directories

## Configuration

### Vite Configuration

Key configuration in `vite.config.ts`:

- **MDX processing** with frontmatter support
- **Syntax highlighting** with Shiki
- **Route generation** plugin
- **Tailwind CSS** integration
- **Code inspector** for development

### Supported Languages

Code highlighting supports:

- JavaScript/TypeScript
- JSX/TSX
- MDX
- JSON
- Shell/Bash

## Deployment

The built site in `dist/` can be deployed to any static hosting service:

- **Vercel** - Zero config deployment
- **Netlify** - Drag and drop the `dist` folder
- **GitHub Pages** - Upload build artifacts
- **Cloudflare Pages** - Connect your repository

## Scripts Reference

- `pnpm dev` - Start development server
- `pnpm build` - Full production build
- `pnpm build:client` - Build client-side app only
- `pnpm build:static` - Generate static HTML via SSR
- `pnpm output` - Process build output
- `pnpm lint` - Run ESLint
- `pnpm preview` - Preview built site locally

## Contributing

When contributing to the documentation:

1. Use `pnpm create:doc` and follow instructions to create a new document.
2. Write your docs.
3. Test your changes locally with `pnpm dev`
4. Ensure the build passes with `pnpm build`
5. Use semantic commit messages

For more information about the Afilmory project architecture, see the main project documentation.
