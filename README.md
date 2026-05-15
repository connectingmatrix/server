# @connectingmatrix/server

Slim server layer that registers package middleware, GraphQL bundles, package migrations, status pages, and dynamically generates MCP manifests.

This repo is intentionally split into `src/ui`, `src/backend`, and `src/entity` so it can be imported by the frontend, backend, or package-owned migration runner without making `giga-ai-backend` a monorepo again.

## Usage

```ts
import { createPackage } from '@connectingmatrix/server';

const pkg = createPackage();
await pkg.health();
```

## Server binding

Each package exports a `registerWithServer(app)` helper when server routes are needed, plus a `graphql` bundle containing `typeDefs`, `resolvers`, and `migrations`.

## Frontend binding

UI loaders expose `.bindWithServer('/graphql')` so the same package can work with the current backend or a separately deployed package host.
