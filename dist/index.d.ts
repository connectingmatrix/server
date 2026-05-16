import { type PackageHealth, type PackageModule, type RequestContext } from './contracts.js';
export interface RuntimePackageModule extends PackageModule {
    runtime?: Record<string, unknown>;
}
export declare function wirePackageRuntime(modules: RuntimePackageModule[]): RuntimePackageModule[];
export declare const Server: {
    register(module: RuntimePackageModule): /*elided*/ any;
    registerMany(modules: RuntimePackageModule[]): /*elided*/ any;
    bindWorkflowExecutor(executor: unknown, config?: unknown): /*elided*/ any;
    bindWorkflowExecutorPubsub(executor: unknown, config?: unknown): /*elided*/ any;
    packages(): RuntimePackageModule[];
    graphqlManifest(): {
        typeDefs: (string | undefined)[];
        resolvers: Record<string, Record<string, unknown>>;
    };
    migrations(): string[];
    launchers(context?: RequestContext): Promise<import("./contracts.js").PackageLauncherPanel[]>;
    mcpManifest(): {
        generatedAt: string;
        packages: {
            name: string;
            graphql: string | undefined;
            routes: {
                method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
                path: string;
            }[] | undefined;
            launcher: boolean;
            migrations: number;
            runtime: string[];
        }[];
    };
    processMonitor(): Promise<unknown>;
    processMonitoring: {
        list(filter?: unknown): {};
        live(handler?: (rows: unknown) => unknown): {};
        queueStatus(filter?: unknown): {};
        runtimeSources(): {};
        logs: {
            live(processId: string, handler?: (rows: unknown) => unknown): {};
        };
        abort(processId: string, reason?: string, context?: RequestContext): {};
        kill(processId: string, reason?: string, context?: RequestContext): {};
    };
    health(): PackageHealth;
    launcher: typeof import("./launcher.js").createConnectingmatrixServerStubLauncher;
};
export declare function createPackage(): PackageModule;
export * from './contracts.js';
export * from './package-structure.js';
export * from './observability.js';
export * from './launcher.js';
