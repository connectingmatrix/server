import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { liveMcpDescribe, liveMcpOrgId } from './mcp-live.constants';
import { resolveLiveMcpCredentialId } from './mcp-live.credentials';
import { startMcpLiveHarness, stopMcpLiveHarness, McpLiveHarness } from './mcp-live.harness';
import { tinySeedCsvBase64 } from './mcp-live.package';
import { attachMcpToolParityWorkflow } from './mcp-live.workflow';

let live: McpLiveHarness;

const finalResponse = async (chat: any) =>
  chat.agent?.requires_confirmation
    ? live.call('giga.query_chat', { chatId: chat.chat.id, message: 'confirm', scope: chat.debug.scope, topK: 2 })
    : chat;

const actionNames = (chat: any) => (chat.agent?.action_results || []).map((result: any) => String(result.name || '').toLowerCase());

liveMcpDescribe('live QueryChat AI-Agent parity for generic MCP, drive, and ML tools', () => {
  before(async () => {
    live = await startMcpLiveHarness(26);
  });

  after(async () => stopMcpLiveHarness(live));

  it('lets AI Agent call MCP Runtime and generic tools connected on cmd:tools', async (t) => {
    const summary = await live.call('giga.shared_space_summary', { organizationId: liveMcpOrgId }).catch((error) => ({ error: error.message }));
    if (summary.error || summary.permissions?.allowCreate !== true || summary.permissions?.allowUpdate !== true) {
      t.skip(`Rich live user lacks SHARED_SPACE create/update on ${liveMcpOrgId}: ${summary.error || 'permission denied'}`);
      return;
    }
    const scope = await live.call('giga.ensure_channel_path', { path: `${live.paths.mcpChannelPath}-agent-tools` });
    live.ids.channels.add(scope.channelId);
    const credentialId = await resolveLiveMcpCredentialId();
    await attachMcpToolParityWorkflow({
      description: 'MCP live AI-Agent generic tool fixture',
      credentialId,
      driveRoot: live.paths.mcpDriveRoot,
      ids: live.ids,
      organizationId: liveMcpOrgId,
      scopeId: scope.channelId,
      userId: live.session.userId,
    });
    await live.call('giga.shared_space_mkdir', { organizationId: liveMcpOrgId, path: live.paths.mcpDriveRoot });
    const targetPath = `${live.paths.mcpDriveRoot}/agent-artifact.json`;
    await live.call('giga.shared_space_write_file', {
      organizationId: liveMcpOrgId,
      path: targetPath,
      contentBase64: Buffer.from(JSON.stringify({ runId: live.runId })).toString('base64'),
    });
    const result = await finalResponse(
      await live.call('giga.query_chat', {
        message: `Use the MCP Runtime tool to write this exact base64 JSON artifact to ${targetPath}, then list ${
          live.paths.mcpDriveRoot
        }. contentBase64=${Buffer.from(JSON.stringify({ runId: live.runId })).toString('base64')}`,
        scope: { type: 'channel', id: scope.channelId },
        topK: 2,
      }),
    );
    live.ids.chats.add(result.chat.id);
    assert.equal(
      actionNames(result).some((name: string) => name.includes('mcp runtime')),
      true,
      JSON.stringify(result.agent || {}),
    );
    const stat = await live.call('giga.shared_space_checksum', { organizationId: liveMcpOrgId, path: targetPath });
    assert.ok(stat.checksum);
  });

  it('exposes generic feature/trainer/scorer tools to the AI Agent catalog', async (t) => {
    const summary = await live.call('giga.shared_space_summary', { organizationId: liveMcpOrgId }).catch((error) => ({ error: error.message }));
    if (summary.error || summary.permissions?.allowCreate !== true || summary.permissions?.allowUpdate !== true) {
      t.skip(`Rich live user lacks SHARED_SPACE create/update on ${liveMcpOrgId}: ${summary.error || 'permission denied'}`);
      return;
    }
    const sourcePath = `${live.paths.mcpDriveRoot}/seed.csv`;
    await live.call('giga.shared_space_mkdir', { organizationId: liveMcpOrgId, path: live.paths.mcpDriveRoot });
    await live.call('giga.shared_space_write_file', { organizationId: liveMcpOrgId, path: sourcePath, contentBase64: tinySeedCsvBase64() });
    const scope = await live.call('giga.ensure_channel_path', { path: `${live.paths.mcpChannelPath}-agent-ml` });
    live.ids.channels.add(scope.channelId);
    const credentialId = await resolveLiveMcpCredentialId();
    await attachMcpToolParityWorkflow({
      description: 'MCP live AI-Agent ML tool fixture',
      credentialId,
      driveRoot: live.paths.mcpDriveRoot,
      ids: live.ids,
      organizationId: liveMcpOrgId,
      scopeId: scope.channelId,
      userId: live.session.userId,
    });
    const result = await finalResponse(
      await live.call('giga.query_chat', {
        message: `Use the connected Feature Analysis, Decision Tree Trainer, Neural Net Trainer, and Model Scorer tools on the PHI-safe CSV at ${sourcePath}. Keep output bounded and do not show raw rows.`,
        scope: { type: 'channel', id: scope.channelId },
        topK: 2,
      }),
    );
    live.ids.chats.add(result.chat.id);
    const names = actionNames(result);
    assert.equal(
      names.some((name: string) => name.includes('feature') || name.includes('decision') || name.includes('neural') || name.includes('model scorer')),
      true,
      JSON.stringify(result.agent || {}),
    );
    assert.doesNotMatch(String(result.answer?.text || ''), /patient|member id|raw rows/i);
  });
});
