import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { liveMcpOrgId, rcmLiveDescribe } from './mcp-live.constants';
import { resolveLiveMcpCredentialId } from './mcp-live.credentials';
import { startMcpLiveHarness, stopMcpLiveHarness, McpLiveHarness } from './mcp-live.harness';
import { tinySeedAttachment } from './mcp-live.package';
import { attachMcpToolParityWorkflow } from './mcp-live.workflow';

let live: McpLiveHarness;

const maybeConfirm = async (chat: any) =>
  chat.agent?.requires_confirmation
    ? live.call('giga.query_chat', { chatId: chat.chat.id, message: 'confirm', scope: chat.debug.scope, topK: 2 })
    : chat;

rcmLiveDescribe('live QueryChat RCM bootstrap without seed scripts', () => {
  before(async () => {
    live = await startMcpLiveHarness(27);
  });

  after(async () => stopMcpLiveHarness(live));

  it('copies an attached PHI-safe seed CSV into Organisation Drive through MCP', async (t) => {
    const summary = await live.call('giga.shared_space_summary', { organizationId: liveMcpOrgId }).catch((error) => ({ error: error.message }));
    if (summary.error || summary.permissions?.allowCreate !== true || summary.permissions?.allowUpdate !== true) {
      t.skip(`Rich live user lacks SHARED_SPACE create/update on ${liveMcpOrgId}: ${summary.error || 'permission denied'}`);
      return;
    }
    const channel = await live.call('giga.ensure_channel_path', { path: live.paths.rcmChannelPath });
    live.ids.channels.add(channel.channelId);
    const chat = await live.call('giga.query_chat', {
      message: 'This chat contains a tiny PHI-safe RCM seed CSV attachment. Acknowledge only.',
      scope: { type: 'channel', id: channel.channelId },
      attachments: [tinySeedAttachment('rcm-seed.csv')],
      topK: 1,
    });
    live.ids.chats.add(chat.chat.id);
    await live.call('giga.shared_space_mkdir', { organizationId: liveMcpOrgId, path: live.paths.rcmDriveRoot });
    const copied = await live.call('giga.chat_attachment_to_drive', {
      chatId: chat.chat.id,
      organizationId: liveMcpOrgId,
      path: `${live.paths.rcmDriveRoot}/source.csv`,
      attachmentIndex: 0,
    });
    assert.equal(copied.path, `${live.paths.rcmDriveRoot}/source.csv`);
  });

  it('prompts AI Agent to build and run an RCM seed workflow from an attached CSV', async (t) => {
    const summary = await live.call('giga.shared_space_summary', { organizationId: liveMcpOrgId }).catch((error) => ({ error: error.message }));
    if (summary.error || summary.permissions?.allowCreate !== true || summary.permissions?.allowUpdate !== true) {
      t.skip(`Rich live user lacks SHARED_SPACE create/update on ${liveMcpOrgId}: ${summary.error || 'permission denied'}`);
      return;
    }
    const channel = await live.call('giga.ensure_channel_path', { path: `${live.paths.rcmChannelPath}-agent` });
    live.ids.channels.add(channel.channelId);
    const credentialId = await resolveLiveMcpCredentialId();
    await attachMcpToolParityWorkflow({
      description: 'RCM bootstrap live AI-Agent fixture without seed scripts',
      credentialId,
      driveRoot: live.paths.rcmDriveRoot,
      ids: live.ids,
      organizationId: liveMcpOrgId,
      scopeId: channel.channelId,
      userId: live.session.userId,
    });
    await live.call('giga.shared_space_mkdir', { organizationId: liveMcpOrgId, path: live.paths.rcmDriveRoot });
    const sourcePath = `${live.paths.rcmDriveRoot}/source.csv`;
    const seeded = await maybeConfirm(
      await live.call('giga.query_chat', {
        message: [
          `Use the attached seed CSV and upload it to Organisation Drive at ${sourcePath}.`,
          'Then save an automated RCM bootstrap workflow named RCM Bootstrap Live using only generic nodes: Excel/CSV stream profile, Feature Analysis, Decision Tree Trainer, Neural Net Trainer, Artifact Publish, knowledge publishing, workflow creation, and channel assignment.',
          'Use the Workflow tool to save the workflow first and the Execute Workflow tool to run it after saving.',
          'Do not answer with a standalone scoring action. Build and run the workflow instead.',
          'Return executionId, runId, workflowId, realtime binding instructions, created artifact names, and PHI safety status. Do not call any RCM seed script.',
        ].join(' '),
        scope: { type: 'channel', id: channel.channelId },
        attachments: [tinySeedAttachment('rcm-seed.csv')],
        chatExecutionMode: 'async',
        topK: 2,
      }),
    );
    live.ids.chats.add(seeded.chat.id);
    assert.equal(seeded.debug.execution_mode, 'workflow_async');
    assert.ok(seeded.debug.execution_id);
    assert.ok(seeded.debug.run_id);
    assert.ok(seeded.debug.workflow_id);
    const binding = await live.call('giga.workflow_realtime_binding', {
      workflowId: seeded.debug.workflow_id,
      executionId: seeded.debug.execution_id,
      runId: seeded.debug.run_id,
    });
    assert.equal(binding.path, '/ws/workflow');
    const stat = await live.call('giga.shared_space_checksum', { organizationId: liveMcpOrgId, path: sourcePath });
    assert.ok(stat.checksum);
    assert.doesNotMatch(String(seeded.answer?.text || ''), /raw patient|member id|exact claim/i);
  });
});
