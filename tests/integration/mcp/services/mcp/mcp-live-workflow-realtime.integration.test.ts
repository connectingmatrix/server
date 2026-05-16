import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { attachPublishedParityWorkflow } from '@connectingmatrix/chat/services/chat/__tests__/chat-parity-workflow.fixture';
import { liveMcpDescribe } from './mcp-live.constants';
import { startMcpLiveHarness, stopMcpLiveHarness, McpLiveHarness } from './mcp-live.harness';
import { tinySeedAttachment } from './mcp-live.package';

let live: McpLiveHarness;

liveMcpDescribe('live MCP workflow execution, output, logs, and realtime binding', () => {
  before(async () => {
    live = await startMcpLiveHarness(25);
  });

  after(async () => stopMcpLiveHarness(live));

  it('starts workflow-backed QueryChat asynchronously and exposes execution APIs', async () => {
    const scope = await live.call('giga.ensure_channel_path', { path: live.paths.mcpChannelPath });
    live.ids.channels.add(scope.channelId);
    const attached = await attachPublishedParityWorkflow({
      description: 'MCP live async QueryChat fixture',
      ids: live.ids,
      liveTest: 'mcp-live-async',
      scopeId: scope.channelId,
      system: 'ai-agent',
      userId: live.session.userId,
    });
    const result = await live.call('giga.query_chat', {
      message: 'Start this workflow asynchronously and return tracking details.',
      scope: { type: 'channel', id: scope.channelId },
      attachments: [tinySeedAttachment()],
      chatExecutionMode: 'async',
    });
    live.ids.chats.add(result.chat.id);
    assert.equal(result.debug.execution_mode, 'workflow_async');
    assert.equal(result.debug.workflow_id, attached.workflowId);
    assert.ok(result.debug.execution_id);
    assert.ok(result.debug.run_id);
    const binding = await live.call('giga.workflow_realtime_binding', {
      workflowId: attached.workflowId,
      executionId: result.debug.execution_id,
      runId: result.debug.run_id,
    });
    assert.equal(binding.path, '/ws/workflow');
    assert.equal(binding.events.includes('workflow:execution:update'), true);
    const execution = await live.call('giga.get_workflow_execution', {
      workflowId: attached.workflowId,
      executionId: result.debug.execution_id,
      scope: 'user',
    });
    assert.equal(execution.id, result.debug.execution_id);
    const output = await live.call('giga.get_workflow_output', {
      workflowId: attached.workflowId,
      executionId: result.debug.execution_id,
      scope: 'user',
    });
    assert.equal(output.executionId, result.debug.execution_id);
    const versions = await live.call('giga.list_workflow_versions', { workflowId: attached.workflowId, scope: 'user' });
    assert.equal(Array.isArray(versions), true);
    const dryRun = await live.call('giga.execute_workflow', { workflowId: attached.workflowId, scope: 'user', dryRun: true });
    assert.equal(dryRun.action, 'execute_workflow');
  });
});
