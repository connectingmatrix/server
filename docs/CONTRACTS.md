# @connectingmatrix/server

Thin package composition layer for middleware, GraphQL merge, migrations, MCP, launchers, process monitor, and runtime wiring.

## Ownership

This package owns its `src/ui`, `src/backend`, `src/entity`, GraphQL bundle, migrations, health/status, launcher, and package contracts. It can be included in backend or UI without assuming a monorepo.

## Public contracts

- `Server.register/registerMany/packages`
- `Server.graphqlManifest/migrations/mcpManifest/launchers`
- `Server.processMonitor()`
- `wirePackageRuntime packages logger/sockets/chat/workflows/tree/file/drive/projects/swarm/giga-agents`


## Basic usage

```ts
import { Server } from '@connectingmatrix/server';
Server.registerMany([LoggerPkg, SocketPkg, ChatPkg, ProjectsPkg]);
const manifest = Server.graphqlManifest();
```

## Server usage

```ts
import { createPackage } from '@connectingmatrix/server';
const pkg = createPackage();
await pkg.health?.();
// register pkg.routes as middleware and merge pkg.graphql into /graphql
```

## UI usage

Package UI modules expose `bindWithServer('/graphql')` where applicable. Domain packages own their dataloaders; the thin UI only renders/binds.

## Observability and process monitor

All packages expose `PackageObservability`. The server wires logger and sockets into every package. Logger registers package health probes and exposes `/logger/process-monitor` plus `/server/process-monitor`.

## Launcher

Run locally:

```bash
npm run build
node playground.mjs
```

The launcher opens in stub mode so the package can be tested independently, similar to workflow designer stub mode.

## GraphQL and routes

GraphQL namespace and routes are returned by `createPackage()`. Routes include health and launcher endpoints when needed.

## Exports

- `.`
- `./backend`
- `./ui`
- `./entity`
- `./package.json`
- `./package-structure`
- `./launcher`
- `./observability`

## Folder counts

- `src/ui`: 2 files
- `src/backend`: 165 files
- `src/entity`: 26 files
- `migrations`: 20 files
- `tests`: 85 files

## Eighth pass runtime wiring contract

`@connectingmatrix/server` wires package runtime relationships and exposes the composed process-monitoring facade. It binds Logger/Sockets/ProcessMonitor to all package runtimes, wires File to Projects/Nodes/Drive, Nodes to Workflows, GigaAgents to Workflows/Tree/Nodes, and Swarm to AI/Advanced/Giga systems.

```ts
processMonitoring.list();
processMonitoring.live(handler);
processMonitoring.logs.live('PROCESS_ID', handler);
await processMonitoring.abort('PROCESS_ID', 'stop');
await processMonitoring.kill('PROCESS_ID', 'kill');
```
