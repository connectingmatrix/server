# Usage for @connectingmatrix/server

```ts
import { Server } from '@connectingmatrix/server';
Server.registerMany([LoggerPkg, SocketPkg, ChatPkg, ProjectsPkg]);
const manifest = Server.graphqlManifest();
```

See `../README.md` for the full contract list.

## Eighth pass runtime wiring contract

`@connectingmatrix/server` wires package runtime relationships and exposes the composed process-monitoring facade. It binds Logger/Sockets/ProcessMonitor to all package runtimes, wires File to Projects/Nodes/Drive, Nodes to Workflows, GigaAgents to Workflows/Tree/Nodes, and Swarm to AI/Advanced/Giga systems.

```ts
processMonitoring.list();
processMonitoring.live(handler);
processMonitoring.logs.live('PROCESS_ID', handler);
await processMonitoring.abort('PROCESS_ID', 'stop');
await processMonitoring.kill('PROCESS_ID', 'kill');
```
