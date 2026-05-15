import { nowIso } from './contracts.js';
function normalizeRootTypeDefs(typeDefs) {
    return typeDefs
        .replace(/\btype\s+Query\b/g, 'extend type Query')
        .replace(/\btype\s+Mutation\b/g, 'extend type Mutation')
        .replace(/\btype\s+Subscription\b/g, 'extend type Subscription');
}
function mergeResolverMaps(bundles) {
    const merged = {
        Query: { packageRuntimeHealth: () => 'ok' },
        Mutation: { packageRuntimeNoop: () => true },
    };
    for (const bundle of bundles) {
        const resolverMap = bundle.resolvers;
        for (const [typeName, fields] of Object.entries(resolverMap)) {
            merged[typeName] = { ...(merged[typeName] ?? {}), ...(fields ?? {}) };
        }
    }
    return merged;
}
class ConnectingMatrixServer {
    constructor() {
        this.modules = [];
    }
    register(module) { if (!this.modules.find((m) => m.module.name === module.name))
        this.modules.push({ module, registeredAt: nowIso() }); return this; }
    registerAsMiddleware(app) {
        const methodMap = { GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete' };
        for (const { module } of this.modules)
            for (const route of module.routes ?? []) {
                const method = methodMap[route.method];
                const fn = app[method];
                if (typeof fn === 'function')
                    fn.call(app, route.path, route.handler);
            }
        return this;
    }
    registerSlashCommands(registrar) {
        for (const command of this.slashCommands())
            registrar.registerSlashCommand(command.command, command.handler, { owner: command.owner, description: command.description });
        return this;
    }
    graphqlBundles() { return this.modules.map((m) => m.module.graphql).filter(Boolean); }
    slashCommands() { return this.modules.flatMap(({ module }) => module.slashCommands ?? []); }
    mergedGraphQL() {
        const bundles = this.graphqlBundles();
        return {
            typeDefs: [`type Query { packageRuntimeHealth: String } type Mutation { packageRuntimeNoop: Boolean } type Subscription { packageRuntimeEvents: String }`, ...bundles.map((g) => normalizeRootTypeDefs(g.typeDefs))].join('\n'),
            resolvers: mergeResolverMaps(bundles),
            migrations: this.modules.flatMap((m) => m.module.migrations ?? m.module.graphql?.migrations ?? []),
            namespaces: bundles.map((bundle) => bundle.namespace),
        };
    }
    async health() { const modules = await Promise.all(this.modules.map(async ({ module }) => ({ name: module.name, health: await module.health() }))); return { name: '@connectingmatrix/server', status: modules.every((m) => m.health.status === 'ok') ? 'ok' : 'degraded', checkedAt: nowIso(), details: { modules, slashCommands: this.slashCommands().map((cmd) => ({ command: cmd.command, owner: cmd.owner })) } }; }
    mcpManifest() { return { generatedAt: nowIso(), packages: this.modules.map(({ module }) => ({ name: module.name, version: module.version, graphql: module.graphql?.namespace, healthRoute: module.routes?.find((route) => route.path.endsWith('/health'))?.path })), tools: this.modules.flatMap(({ module }) => (module.routes ?? []).map((route) => ({ name: `${module.name}:${route.method}:${route.path}`, package: module.name, method: route.method, path: route.path }))), slashCommands: this.slashCommands().map(({ command, owner, description }) => ({ command, owner, description })) }; }
}
export const Server = new ConnectingMatrixServer();
export function createPackage() { return { name: '@connectingmatrix/server', version: '0.1.0', health: () => Server.health(), routes: [{ method: 'GET', path: '/server/health', handler: () => Server.health() }, { method: 'GET', path: '/server/mcp', handler: () => Server.mcpManifest() }] }; }
export * from './contracts.js';
