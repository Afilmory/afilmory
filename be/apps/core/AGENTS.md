# agents.md

## `be/apps/core` - Backend Architecture

This document provides a detailed overview of the backend server's architecture, built with Hono.

### Core Technologies

- **Web Framework**: **Hono** - A fast, lightweight, and flexible web framework for the edge.
- **Dependency Injection**: **tsyringe** - A lightweight dependency injection container for TypeScript/JavaScript, ensuring services are decoupled and easily testable.
- **ORM**: **Drizzle ORM** - A TypeScript ORM that provides type-safe database queries.
- **Database**: **PostgreSQL** - The primary relational database.

### Architecture Overview

The backend follows a modular, DI-driven architecture to ensure separation of concerns and maintainability.

- **Dependency Injection**: At the core, `tsyringe` manages the lifecycle and injection of services, controllers, and repositories. This makes the codebase loosely coupled. The main container is configured in `app.factory.ts`.
- **Modular Structure**: The application logic is organized into feature-based modules under `src/modules`. Each module (e.g., `auth`, `photo`, `tenant`) encapsulates its own controllers, services, and data transfer objects (DTOs), making the system easy to extend.
- **Request Lifecycle**: A request flows through Hono's middleware, is routed to a specific controller, which then utilizes injected services to perform business logic. Services may interact with the database via Drizzle ORM.

### Frontend Integration (`static-web` module)

A key responsibility of `be/apps/core` is to serve the `apps/web` SPA and enrich it with dynamic data.

- **Serving Static Files**: The `StaticWebModule` is responsible for serving the built assets of the `apps/web` application.
- **Dynamic Data Injection**: Before sending the `index.html` file to the client, the `StaticWebService` intercepts the response and injects dynamic data into the HTML. It finds the `<script id="manifest">` and `<script id="config">` tags and populates them with live data from the database.
  - `window.__CONFIG__`: Injects server-side configuration.
  - `window.__MANIFEST__`: Injects the complete, real-time photo manifest, making the frontend fully dynamic.

This approach allows the frontend SPA to remain completely unaware of the data source (static file vs. live backend), as it always consumes the data from the same global variables.
