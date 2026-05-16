import { describe } from 'node:test';

export const runLiveMcpTests = process.env.RUN_LIVE_MCP_TESTS === '1';
export const runRcmLiveTests = process.env.RUN_RCM_LIVE_TESTS === '1';
export const liveMcpDescribe = runLiveMcpTests ? describe : describe.skip;
export const rcmLiveDescribe = runLiveMcpTests || runRcmLiveTests ? describe : describe.skip;
export const liveMcpOrgId = 'cec7535f-1549-4eee-9d2e-ec2a3f086511';
export const liveMcpUserId = '38d30c56-2f1d-405e-acc3-fe6a6e96cbc5';

export const liveMcpPaths = (runId: string) => ({
  mcpChannelPath: `giga-ai-test/queryChat/mcp-live-${runId}`,
  mcpDriveRoot: `/drive/giga-ai-test/mcp-live/${runId}`,
  rcmChannelPath: `giga-ai-test/queryChat/rcm-live-${runId}`,
  rcmDriveRoot: `/drive/giga-ai-test/rcm-live/${runId}`,
});
