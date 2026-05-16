import { randomUUID } from 'node:crypto';
import { cleanupCreated } from '@connectingmatrix/chat/services/chat/__tests__/chat-giga-live.cleanup';
import { closeLiveSession, createLiveChatScope, liveQueueEnv, readLiveSession } from '@connectingmatrix/chat/services/chat/__tests__/chat-giga-live.fixture';
import { createdIds } from '@connectingmatrix/chat/services/chat/__tests__/chat-giga-live.ids';
import { LIVE_CHAT_EMAIL, LIVE_CHAT_PORT } from '@connectingmatrix/chat/services/chat/__tests__/chat-giga-live.queries';
import { ensureEntityOrmInstalled } from '@connectingmatrix/orm/services/graphql/entity-request-context';
import { liveMcpOrgId, liveMcpPaths } from './mcp-live.constants';
import { mcpCall, mcpRaw } from './mcp-live.client';
import { ensureLiveSharedSpacePermission, restoreLiveSharedSpacePermission } from './mcp-live.permissions';
import type { LiveSession } from '@connectingmatrix/chat/services/chat/__tests__/chat-giga-live.fixture';

export type McpLiveHarness = Awaited<ReturnType<typeof startMcpLiveHarness>>;

export async function startMcpLiveHarness(portOffset: number) {
  const runId = randomUUID().slice(0, 8);
  const ids = createdIds();
  const liveNodeIds = new Set<string>();
  const paths = liveMcpPaths(runId);
  Object.assign(process.env, liveQueueEnv(LIVE_CHAT_PORT + portOffset));
  await ensureEntityOrmInstalled();
  const session = await readLiveSession(LIVE_CHAT_PORT + portOffset, LIVE_CHAT_EMAIL);
  const sharedSpacePermission = await ensureLiveSharedSpacePermission(liveMcpOrgId, session.userId);
  return {
    ids,
    liveNodeIds,
    paths,
    sharedSpacePermission,
    runId,
    session,
    call: <T = any>(name: string, args: Record<string, unknown> = {}) => mcpCall<T>(session, name, args),
    raw: (method: string, params: Record<string, unknown>, authorized = true) => mcpRaw(session, method, params, authorized),
    createScope: async (name: string) => {
      const scope = await createLiveChatScope(session.userId, { name });
      ids.channels.add(scope.id);
      return scope;
    },
  };
}

export async function stopMcpLiveHarness(harness?: { ids: any; liveNodeIds: Set<string>; paths: any; session: LiveSession }) {
  if (!harness?.session) return;
  for (const id of harness.liveNodeIds) await mcpCall(harness.session, 'giga.delete_scoped_node', { id }).catch(() => null);
  for (const path of [harness.paths.mcpDriveRoot, harness.paths.rcmDriveRoot])
    await mcpCall(harness.session, 'giga.shared_space_delete', { organizationId: liveMcpOrgId, path }).catch(() => null);
  await cleanupCreated(harness.ids);
  await restoreLiveSharedSpacePermission((harness as any).sharedSpacePermission).catch(() => null);
  await closeLiveSession(harness.session);
}
