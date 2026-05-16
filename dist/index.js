import { nowIso } from './contracts.js';
import { createStubLauncher } from './launcher.js';
import { PackageObservability } from './observability.js';
const registered = [];
let boundWorkflowExecutor;
let boundWorkflowExecutorConfig;
function getRuntime(module) { return module?.runtime ?? {}; }
function runtimeOf(modules, name) { return getRuntime(modules.get(name)); }
function call(target, method, ...args) { const fn = target && typeof target === 'object' ? target[method] : undefined; return typeof fn === 'function' ? fn.apply(target, args) : undefined; }
function processMonitoringRuntime(modules) { const loggerRuntime = getRuntime(modules.find((m) => m.name === '@connectingmatrix/logger')); return loggerRuntime.processMonitoring ?? loggerRuntime.ProcessMonitor ?? loggerRuntime.Logger; }
export function wirePackageRuntime(modules) {
    const byName = new Map(modules.map((m) => [m.name, m]));
    const loggerRuntime = runtimeOf(byName, '@connectingmatrix/logger');
    const socketRuntime = runtimeOf(byName, '@connectingmatrix/sockets');
    const logger = loggerRuntime.Logger;
    const processMonitoring = loggerRuntime.processMonitoring ?? loggerRuntime.ProcessMonitor;
    const socket = socketRuntime.Socket;
    if (socket)
        call(logger, 'bindSockets', socket);
    if (logger)
        call(socket, 'bindLogger', logger);
    if (socket)
        call(processMonitoring, 'bindSockets', socket);
    for (const module of modules) {
        const runtime = getRuntime(module);
        const observability = runtime.observability;
        observability?.bind?.({ logger, sockets: socket });
        observability?.registerHealth?.(module.health);
        call(logger, 'registerPackage', module.name, module.health);
        call(processMonitoring, 'recordPackageSnapshot', module.name, module.health);
        for (const value of Object.values(runtime)) {
            if (logger)
                call(value, 'bindLogger', logger);
            if (socket)
                call(value, 'bindSockets', socket);
        }
    }
    const chat = runtimeOf(byName, '@connectingmatrix/chat');
    const workflows = runtimeOf(byName, '@connectingmatrix/workflows');
    const tree = runtimeOf(byName, '@giga/tree');
    const file = runtimeOf(byName, '@connectingmatrix/file');
    const drive = runtimeOf(byName, '@giga/drive');
    const projects = runtimeOf(byName, '@connectingmatrix/projects');
    const aiAgents = runtimeOf(byName, '@connectingmatrix/ai-agents');
    const advancedAgents = runtimeOf(byName, '@connectingmatrix/ai-agents-advanced');
    const swarm = runtimeOf(byName, '@connectingmatrix/agent-swarm');
    const gigaAgents = runtimeOf(byName, '@connectingmatrix/giga-agents');
    const nodes = runtimeOf(byName, '@connectingmatrix/nodes');
    if (workflows.workflowSlashCommands)
        call(chat.Chat, 'registerSlashCommands', workflows.workflowSlashCommands);
    if (tree.treeSlashCommands)
        call(chat.Chat, 'registerSlashCommands', tree.treeSlashCommands);
    call(drive.Drive, 'useFileModule', file.File, 'memory');
    call(chat.Chat, 'bindDrive', drive.Drive);
    call(projects.Projects, 'useFileModule', file.File, 'memory');
    call(projects.Projects, 'bindChat', chat.Chat);
    call(projects.Projects, 'bindAdvancedAgents', advancedAgents.AdvancedAIAgents);
    call(nodes.Nodes, 'useFileModule', file.File, 'memory');
    call(nodes.Nodes, 'bindChat', chat.Chat);
    call(workflows.Workflows, 'bindNodes', nodes.Nodes);
    call(aiAgents.AIAgents, 'bindProcessMonitoring', processMonitoring);
    call(aiAgents.AIAgents, 'bindProcessMonitor', processMonitoring);
    call(advancedAgents.AdvancedAIAgents, 'bindProcessMonitoring', processMonitoring);
    call(swarm.AgentSwarm, 'bindAgents', aiAgents.AIAgents);
    call(swarm.AgentSwarm, 'bindSystems', { aiAgents: aiAgents.AIAgents, advancedAgents: advancedAgents.AdvancedAIAgents, gigaAgents: gigaAgents.GigaAgents });
    call(swarm.AgentSwarm, 'bindProcessMonitoring', processMonitoring);
    call(swarm.AgentSwarm, 'bindProcessMonitor', processMonitoring);
    call(projects.Projects, 'bindProcessMonitoring', processMonitoring);
    call(projects.Projects, 'bindProcessMonitor', processMonitoring);
    call(nodes.Nodes, 'bindProcessMonitoring', processMonitoring);
    call(nodes.Nodes, 'bindProcessMonitor', processMonitoring);
    call(workflows.Workflows, 'bindProcessMonitoring', processMonitoring);
    call(workflows.Workflows, 'bindProcessMonitor', processMonitoring);
    call(gigaAgents.GigaAgents, 'bindProcessMonitoring', processMonitoring);
    call(gigaAgents.GigaAgents, 'bindProcessMonitor', processMonitoring);
    call(gigaAgents.GigaAgents, 'bindCoreAgents', aiAgents.AIAgents);
    call(gigaAgents.GigaAgents, 'bindAdapters', { workflows: workflows.Workflows, tree: tree.Tree, nodes: nodes.Nodes, aiAgents: aiAgents.AIAgents, advancedAgents: advancedAgents.AdvancedAIAgents });
    call(workflows.Workflows, 'bindGigaAgents', gigaAgents.GigaAgents);
    call(workflows.Workflows, 'useWorkflowAIAgent', gigaAgents.GigaAgents);
    if (boundWorkflowExecutor) {
        call(workflows.Workflows, 'bindExecutorPubSub', boundWorkflowExecutor, boundWorkflowExecutorConfig);
        call(processMonitoring, 'bindWorkflowExecutorPubsub', boundWorkflowExecutor, boundWorkflowExecutorConfig);
    }
    return modules;
}
export const Server = {
    register(module) { registered.push(module); wirePackageRuntime(registered); return Server; },
    registerMany(modules) { for (const m of modules)
        registered.push(m); wirePackageRuntime(registered); return Server; },
    bindWorkflowExecutor(executor, config) { boundWorkflowExecutor = executor; boundWorkflowExecutorConfig = config; wirePackageRuntime(registered); return Server; },
    bindWorkflowExecutorPubsub(executor, config) { return Server.bindWorkflowExecutor(executor, config); },
    packages() { return [...registered]; },
    graphqlManifest() { const typeDefs = registered.map((m) => m.graphql?.typeDefs).filter(Boolean); const resolvers = {}; for (const m of registered)
        for (const [type, map] of Object.entries(m.graphql?.resolvers ?? {}))
            resolvers[type] = { ...(resolvers[type] ?? {}), ...map }; return { typeDefs, resolvers }; },
    migrations() { return registered.flatMap((m) => m.migrations ?? m.graphql?.migrations ?? []); },
    async launchers(context = {}) { const panels = []; for (const m of registered)
        if (m.launcher)
            panels.push(await m.launcher(context)); return panels; },
    mcpManifest() { return { generatedAt: nowIso(), packages: registered.map((m) => ({ name: m.name, graphql: m.graphql?.namespace, routes: m.routes?.map((r) => ({ method: r.method, path: r.path })), launcher: Boolean(m.launcher), migrations: m.migrations?.length ?? 0, runtime: Object.keys(m.runtime ?? {}) })) }; },
    async processMonitor() { const loggerRuntime = getRuntime(registered.find((m) => m.name === '@connectingmatrix/logger')); return loggerRuntime.Logger?.processMonitorSnapshot ? loggerRuntime.Logger.processMonitorSnapshot() : { checkedAt: nowIso(), packages: await Promise.all(registered.map((m) => m.health())) }; },
    processMonitoring: {
        list(filter) { return call(processMonitoringRuntime(registered), 'list', filter) ?? []; },
        live(handler) { return call(processMonitoringRuntime(registered), 'live', handler) ?? []; },
        queueStatus(filter) { return call(processMonitoringRuntime(registered), 'queueStatus', filter) ?? []; },
        runtimeSources() { return call(processMonitoringRuntime(registered), 'runtimeSources') ?? []; },
        logs: { live(processId, handler) { const monitor = processMonitoringRuntime(registered); return monitor?.logs?.live?.(processId, handler) ?? []; } },
        abort(processId, reason, context) { return call(processMonitoringRuntime(registered), 'abort', processId, reason, context) ?? { processId, aborted: false, reason: 'process monitor not registered' }; },
        kill(processId, reason, context) { return call(processMonitoringRuntime(registered), 'kill', processId, reason, context) ?? { processId, killed: false, reason: 'process monitor not registered' }; },
    },
    health() { return { name: '@connectingmatrix/server', status: 'ok', checkedAt: nowIso(), details: { packages: registered.length, launchers: registered.filter((m) => m.launcher).length, processMonitoring: Boolean(processMonitoringRuntime(registered)), workflowExecutorBound: Boolean(boundWorkflowExecutor), ...PackageObservability.healthDetails() } }; },
    launcher: createStubLauncher
};
export function createPackage() { return { name: '@connectingmatrix/server', version: '0.4.0', health: () => Server.health(), launcher: createStubLauncher, runtime: { Server, observability: PackageObservability }, routes: [{ method: 'GET', path: '/server/health', handler: () => Server.health() }, { method: 'GET', path: '/server/mcp', handler: () => Server.mcpManifest() }, { method: 'GET', path: '/server/process-monitor', handler: () => Server.processMonitor() }, { method: 'GET', path: '/process-monitoring/list', handler: (request) => Server.processMonitoring.list(request.query) }, { method: 'GET', path: '/process-monitoring/live', handler: () => Server.processMonitoring.live() }, { method: 'GET', path: '/process-monitoring/queue-status', handler: (request) => Server.processMonitoring.queueStatus(request.query) }, { method: 'GET', path: '/process-monitoring/sources', handler: () => Server.processMonitoring.runtimeSources() }, { method: 'GET', path: '/process-monitoring/logs/live', handler: (request) => Server.processMonitoring.logs.live(String(request.query?.processId ?? '')) }, { method: 'POST', path: '/process-monitoring/abort', handler: (request) => Server.processMonitoring.abort(String(request.body?.processId ?? ''), request.body?.reason, request.context ?? {}) }, { method: 'POST', path: '/process-monitoring/kill', handler: (request) => Server.processMonitoring.kill(String(request.body?.processId ?? ''), request.body?.reason, request.context ?? {}) }, { method: 'GET', path: '/server/launchers', handler: (request) => Server.launchers(request.context ?? {}) }] }; }
export * from './contracts.js';
export * from './package-structure.js';
export * from './observability.js';
export * from './launcher.js';
