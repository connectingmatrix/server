# Auto-generated API

```json
{
  "package": "@connectingmatrix/server",
  "summary": "Thin package composition layer for middleware, GraphQL merge, migrations, MCP, launchers, process monitor, and runtime wiring.",
  "contracts": [
    "Server.register/registerMany/packages",
    "Server.graphqlManifest/migrations/mcpManifest/launchers",
    "Server.processMonitor()",
    "wirePackageRuntime packages logger/sockets/chat/workflows/tree/file/drive/projects/swarm/giga-agents"
  ],
  "exports": [
    ".",
    "./backend",
    "./ui",
    "./entity",
    "./package.json",
    "./package-structure",
    "./launcher",
    "./observability"
  ],
  "folderCounts": {
    "src/ui": 2,
    "src/backend": 165,
    "src/entity": 26,
    "migrations": 20,
    "tests": 85
  },
  "launcher": "playground.mjs",
  "observability": true
}
```

## Eighth pass runtime wiring contract

`@connectingmatrix/server` wires package runtime relationships and exposes the composed process-monitoring facade. It binds Logger/Sockets/ProcessMonitor to all package runtimes, wires File to Projects/Nodes/Drive, Nodes to Workflows, GigaAgents to Workflows/Tree/Nodes, and Swarm to AI/Advanced/Giga systems.

```ts
processMonitoring.list();
processMonitoring.live(handler);
processMonitoring.logs.live('PROCESS_ID', handler);
await processMonitoring.abort('PROCESS_ID', 'stop');
await processMonitoring.kill('PROCESS_ID', 'kill');
```
