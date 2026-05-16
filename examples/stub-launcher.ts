import { nowIso, type PackageLauncherPanel, type RequestContext } from './contracts.js';

export function createConnectingmatrixServerStubLauncher(context: RequestContext = {}): PackageLauncherPanel {
  return {
    packageName: '@connectingmatrix/server',
    title: 'Server Composition Launcher',
    mode: 'stub',
    status: 'ready',
    checkedAt: nowIso(),
    summary: 'Launches package registration, middleware, GraphQL composition, MCP/status and runtime wiring.',
    healthPath: '/server/health',
    graphqlNamespace: 'server',
    routes: [
      { method: 'GET', path: '/server/health', description: 'Health/status endpoint' },
      { method: 'GET', path: '/server/launcher', description: 'Stub launcher panel' }
    ],
    owns: {
      ui: ['dataloaders', 'bindWithServer', 'status/launcher UI'],
      backend: ["package middleware", "GraphQL merge", "MCP manifest"],
      entity: ["PackageRegistration"],
      migrations: ['migrations/*.sql']
    },
    actions: [
      { name: 'register', label: 'register', method: 'LOCAL' as const, description: 'Run register demo action' },
      { name: 'wireRuntime', label: 'wireRuntime', method: 'LOCAL' as const, description: 'Run wireRuntime demo action' },
      { name: 'mcp', label: 'mcp', method: 'LOCAL' as const, description: 'Run mcp demo action' }
    ],
    sampleData: { context: 'stub-playground', userId: context.userId ?? 'stub-user' },
    context: { userId: context.userId, organizationId: context.organizationId, root: Boolean(context.root), traceId: context.traceId },
    notes: [
      'This launcher is intentionally stub-mode playable so the package can be tested outside giga-ai-backend.',
      'The launcher exposes this package boundary only; cross-package behavior is injected through adapters.'
    ]
  };
}

export const createStubLauncher = createConnectingmatrixServerStubLauncher;
export const Launcher = { open: createConnectingmatrixServerStubLauncher, mode: 'stub' as const };
export const launcher = createConnectingmatrixServerStubLauncher;
