import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { liveMcpDescribe } from './mcp-live.constants';
import { startMcpLiveHarness, stopMcpLiveHarness, McpLiveHarness } from './mcp-live.harness';
import { unsafeNodeReviewInput } from './mcp-live.package';

let live: McpLiveHarness;

liveMcpDescribe('live MCP protocol, catalog, auth, and node rules', () => {
  before(async () => {
    live = await startMcpLiveHarness(21);
  });

  after(async () => stopMcpLiveHarness(live));

  it('exposes the required tool catalog and denies unauthenticated calls', async () => {
    const initialized = await live.raw('initialize', {});
    assert.equal(initialized.result.serverInfo.name, 'giga-master-mcp');
    const listed = await live.raw('tools/list', {});
    const names = new Set((listed.result.tools || []).map((tool: any) => tool.name));
    for (const name of [
      'giga.me',
      'giga.workflow_realtime_binding',
      'giga.workflow_running_statuses',
      'giga.list_chat_sessions',
      'giga.publish_chat_share',
      'giga.chat_attachment_to_drive',
      'giga.run_querychat_prompt_suite',
      'giga.validate_node_package',
      'giga.import_node_package',
      'giga.export_node_package',
      'giga.shared_space_write_file',
      'giga.shared_space_mkdir',
      'giga.shared_space_checksum',
    ])
      assert.equal(names.has(name), true, `${name} should be registered`);

    const unauthorized = await live.raw('tools/call', { name: 'giga.me', arguments: {} }, false);
    assert.ok(unauthorized.error?.message || unauthorized.status === 401);
  });

  it('returns strict node rules and rejects unsafe worker source', async () => {
    const rules = await live.call('giga.node_source_rules');
    assert.equal(
      rules.rules.some((rule: any) => rule.code === 'blocked_import' && rule.enforced === true),
      true,
    );
    const report = await live.call('giga.review_node_source_rules', unsafeNodeReviewInput());
    assert.equal(report.ok, false);
    assert.equal(report.errors.length > 0, true);
  });
});
