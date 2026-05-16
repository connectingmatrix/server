import { type PackageHealth, type PackageModule, type RequestContext } from './contracts.js';
import { createPackageStatusPanel } from './services/package-status.service.js';
export interface RuntimePackageModule extends PackageModule {
    runtime?: Record<string, unknown>;
}
export declare function wirePackageRuntime(modules: RuntimePackageModule[]): RuntimePackageModule[];
export declare const Server: {
    register(module: RuntimePackageModule): /*elided*/ any;
    registerMany(modules: RuntimePackageModule[]): /*elided*/ any;
    packages(): RuntimePackageModule[];
    graphqlManifest(): {
        typeDefs: string[];
        resolvers: Record<string, Record<string, unknown>>;
    };
    migrations(): string[];
    launchers(context?: RequestContext): Promise<any[]>;
    mcpManifest(): {
        generatedAt: string;
        packages: {
            name: string;
            graphql: string;
            routes: {
                method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
                path: string;
            }[];
            launcher: boolean;
            migrations: number;
            runtime: string[];
        }[];
    };
    processMonitor(): Promise<unknown>;
    processMonitoring: {
        list(filter?: unknown): unknown;
        live(handler?: (rows: unknown) => unknown): unknown;
        logs: {
            live(processId: string, handler?: (rows: unknown) => unknown): unknown;
        };
        abort(processId: string, reason?: string, context?: RequestContext): unknown;
        kill(processId: string, reason?: string, context?: RequestContext): unknown;
    };
    health(): PackageHealth;
    launcher: typeof createPackageStatusPanel;
};
export declare function createPackage(): PackageModule;
export * from './contracts.js';
export * from './package-structure.js';
export * from './observability.js';
export * from './services/package-status.service.js';
