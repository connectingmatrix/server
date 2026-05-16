import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { liveMcpDescribe } from './mcp-live.constants';
import { startMcpLiveHarness, stopMcpLiveHarness, McpLiveHarness } from './mcp-live.harness';
import { liveNodePackageBase64 } from './mcp-live.package';

let live: McpLiveHarness;

liveMcpDescribe('live MCP scoped node package lifecycle', () => {
  before(async () => {
    live = await startMcpLiveHarness(22);
  });

  after(async () => stopMcpLiveHarness(live));

  it('validates, imports, exports, and deletes a .node package', async () => {
    const slug = `mcp-live-node-${live.runId}`;
    const packageBase64 = await liveNodePackageBase64(slug);
    const validation = await live.call('giga.validate_node_package', { packageBase64, fileName: `${slug}.node` });
    assert.equal(validation.report.ok, true);
    const dryRun = await live.call('giga.import_node_package', { packageBase64, fileName: `${slug}.node`, scopeType: 'USER', dryRun: true });
    assert.equal(dryRun.action, 'create');
    const imported = await live.call('giga.import_node_package', {
      packageBase64,
      fileName: `${slug}.node`,
      scopeType: 'USER',
      duplicateStrategy: 'copy',
    });
    live.liveNodeIds.add(imported.id);
    const exported = await live.call('giga.export_node_package', { id: imported.id });
    assert.equal(exported.fileName, `${slug}.node`);
    assert.ok(exported.contentBase64);
  });
});
