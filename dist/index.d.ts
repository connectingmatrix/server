import { type GraphQLPackage, type PackageHealth, type PackageModule, type PackageRoute, type RequestContext } from './contracts.js';
export interface PackageSlashCommand {
    command: string;
    owner?: string;
    description?: string;
    handler: (args: string[], context: RequestContext, raw?: string) => Promise<unknown> | unknown;
}
export interface RegisteredPackage {
    module: PackageModule & {
        slashCommands?: PackageSlashCommand[];
    };
    registeredAt: string;
}
export interface ServerAppLike {
    get?: (path: string, handler: PackageRoute['handler']) => unknown;
    post?: (path: string, handler: PackageRoute['handler']) => unknown;
    put?: (path: string, handler: PackageRoute['handler']) => unknown;
    patch?: (path: string, handler: PackageRoute['handler']) => unknown;
    delete?: (path: string, handler: PackageRoute['handler']) => unknown;
    use?: (...args: unknown[]) => unknown;
}
export interface SlashRegistrar {
    registerSlashCommand(command: string, handler: PackageSlashCommand['handler'], options?: {
        owner?: string;
        description?: string;
    }): unknown;
}
type ResolverMap = Record<string, Record<string, unknown>>;
declare class ConnectingMatrixServer {
    private readonly modules;
    register(module: PackageModule & {
        slashCommands?: PackageSlashCommand[];
    }): this;
    registerAsMiddleware(app: ServerAppLike): this;
    registerSlashCommands(registrar: SlashRegistrar): this;
    graphqlBundles(): GraphQLPackage[];
    slashCommands(): PackageSlashCommand[];
    mergedGraphQL(): {
        typeDefs: string;
        resolvers: ResolverMap;
        migrations: string[];
        namespaces: string[];
    };
    health(): Promise<PackageHealth>;
    mcpManifest(): {
        generatedAt: string;
        packages: {
            name: string;
            version: string;
            graphql: string | undefined;
            healthRoute: string | undefined;
        }[];
        tools: {
            name: string;
            package: string;
            method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
            path: string;
        }[];
        slashCommands: {
            command: string;
            owner: string | undefined;
            description: string | undefined;
        }[];
    };
}
export declare const Server: ConnectingMatrixServer;
export declare function createPackage(): PackageModule;
export * from './contracts.js';
