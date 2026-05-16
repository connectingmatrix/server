import { type PackageLauncherPanel, type RequestContext } from './contracts.js';
export declare function createConnectingmatrixServerStubLauncher(context?: RequestContext): PackageLauncherPanel;
export declare const createStubLauncher: typeof createConnectingmatrixServerStubLauncher;
export declare const Launcher: {
    open: typeof createConnectingmatrixServerStubLauncher;
    mode: "stub";
};
export declare const launcher: typeof createConnectingmatrixServerStubLauncher;
