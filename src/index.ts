import { nowIso, type GraphQLPackage, type PackageHealth, type PackageModule, type PackageRoute, type RequestContext } from './contracts.js';

export interface PackageSlashCommand {
  command: string;
  owner?: string;
  description?: string;
  handler: (args: string[], context: RequestContext, raw?: string) => Promise<unknown> | unknown;
}
export interface RegisteredPackage { module: PackageModule & { slashCommands?: PackageSlashCommand[] }; registeredAt: string; }
export interface ServerAppLike {
  get?: (path: string, handler: PackageRoute['handler']) => unknown;
  post?: (path: string, handler: PackageRoute['handler']) => unknown;
  put?: (path: string, handler: PackageRoute['handler']) => unknown;
  patch?: (path: string, handler: PackageRoute['handler']) => unknown;
  delete?: (path: string, handler: PackageRoute['handler']) => unknown;
  use?: (...args: unknown[]) => unknown;
}
export interface SlashRegistrar { registerSlashCommand(command: string, handler: PackageSlashCommand['handler'], options?: { owner?: string; description?: string }): unknown; }

type ResolverMap = Record<string, Record<string, unknown>>;

function normalizeRootTypeDefs(typeDefs: string): string {
  return typeDefs
    .replace(/\btype\s+Query\b/g, 'extend type Query')
    .replace(/\btype\s+Mutation\b/g, 'extend type Mutation')
    .replace(/\btype\s+Subscription\b/g, 'extend type Subscription');
}

function mergeResolverMaps(bundles: GraphQLPackage[]): ResolverMap {
  const merged: ResolverMap = {
    Query: { packageRuntimeHealth: () => 'ok' },
    Mutation: { packageRuntimeNoop: () => true },
  };
  for (const bundle of bundles) {
    const resolverMap = bundle.resolvers as ResolverMap;
    for (const [typeName, fields] of Object.entries(resolverMap)) {
      merged[typeName] = { ...(merged[typeName] ?? {}), ...(fields ?? {}) };
    }
  }
  return merged;
}

class ConnectingMatrixServer {
  private readonly modules: RegisteredPackage[] = [];
  register(module: PackageModule & { slashCommands?: PackageSlashCommand[] }): this { if (!this.modules.find((m) => m.module.name === module.name)) this.modules.push({ module, registeredAt: nowIso() }); return this; }
  registerAsMiddleware(app: ServerAppLike): this {
    const methodMap: Record<PackageRoute['method'], keyof ServerAppLike> = { GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete' };
    for (const { module } of this.modules) for (const route of module.routes ?? []) {
      const method = methodMap[route.method];
      const fn = app[method];
      if (typeof fn === 'function') fn.call(app, route.path, route.handler);
    }
    return this;
  }
  registerSlashCommands(registrar: SlashRegistrar): this {
    for (const command of this.slashCommands()) registrar.registerSlashCommand(command.command, command.handler, { owner: command.owner, description: command.description });
    return this;
  }
  graphqlBundles(): GraphQLPackage[] { return this.modules.map((m) => m.module.graphql).filter(Boolean) as GraphQLPackage[]; }
  slashCommands(): PackageSlashCommand[] { return this.modules.flatMap(({ module }) => module.slashCommands ?? []); }
  mergedGraphQL() {
    const bundles = this.graphqlBundles();
    return {
      typeDefs: [`type Query { packageRuntimeHealth: String } type Mutation { packageRuntimeNoop: Boolean } type Subscription { packageRuntimeEvents: String }`, ...bundles.map((g) => normalizeRootTypeDefs(g.typeDefs))].join('\n'),
      resolvers: mergeResolverMaps(bundles),
      migrations: this.modules.flatMap((m) => m.module.migrations ?? m.module.graphql?.migrations ?? []),
      namespaces: bundles.map((bundle) => bundle.namespace),
    };
  }
  async health(): Promise<PackageHealth> { const modules = await Promise.all(this.modules.map(async ({ module }) => ({ name: module.name, health: await module.health() }))); return { name: '@connectingmatrix/server', status: modules.every((m) => m.health.status === 'ok') ? 'ok' : 'degraded', checkedAt: nowIso(), details: { modules, slashCommands: this.slashCommands().map((cmd) => ({ command: cmd.command, owner: cmd.owner })) } }; }
  mcpManifest() { return { generatedAt: nowIso(), packages: this.modules.map(({ module }) => ({ name: module.name, version: module.version, graphql: module.graphql?.namespace, healthRoute: module.routes?.find((route) => route.path.endsWith('/health'))?.path })), tools: this.modules.flatMap(({ module }) => (module.routes ?? []).map((route) => ({ name: `${module.name}:${route.method}:${route.path}`, package: module.name, method: route.method, path: route.path }))), slashCommands: this.slashCommands().map(({ command, owner, description }) => ({ command, owner, description })) }; }
}
export const Server = new ConnectingMatrixServer();
export function createPackage(): PackageModule { return { name: '@connectingmatrix/server', version: '0.1.0', health: () => Server.health(), routes: [{ method: 'GET', path: '/server/health', handler: () => Server.health() }, { method: 'GET', path: '/server/mcp', handler: () => Server.mcpManifest() }] }; }
export * from './contracts.js';
