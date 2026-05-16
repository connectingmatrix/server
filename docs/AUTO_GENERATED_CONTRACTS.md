# Auto-generated contracts for `@connectingmatrix/server`

This document is generated from the final package audit. The package owns its `src/ui`, `src/backend`, `src/entity`, migrations, GraphQL/API surfaces, health/status, launcher, and tests unless this is a thin shell repo.

## Public contracts

- `Server.register/registerMany`
- `Server.graphqlManifest/migrations/mcpManifest/launchers`
- `Server.processMonitoring.list/live/logs.live/abort`
- `wirePackageRuntime(modules)`

## Package use

```ts
import { createPackage } from '@connectingmatrix/server';
const pkg = createPackage();
await pkg.health?.();
```

## Backend registration

Register `pkg.routes`, merge `pkg.graphql`, run `pkg.migrations`, and keep auth/signature handling delegated to `@connectingmatrix/orm`.

## Frontend binding

UI adapters expose `bindWithServer('/graphql')` or route-specific helpers. Domain logic remains in the owning package.

## Launcher

```bash
npm run build
npm test
node playground.mjs
```
