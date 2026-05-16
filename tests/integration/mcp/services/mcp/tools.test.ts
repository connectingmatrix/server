import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_SOURCE_RULES, reviewWorkflowNodePackageRules } from '@connectingmatrix/nodes/services/workflow/user-nodes/runtime/rules';
import { validateWorkflowNodePackage } from '@connectingmatrix/nodes/services/workflow/user-nodes/runtime/package-service';
import { GIGA_MCP_TOOLS } from '@giga/mcp/services/mcp/tools';

test('Giga MCP exposes static node source rule capability', () => {
  const nodeRulesTool = GIGA_MCP_TOOLS.find((tool) => tool.name === 'giga.node_source_rules');
  assert.equal(Boolean(nodeRulesTool), true);
  const graphqlAnnotation = nodeRulesTool?.annotations?.graphql as { mutation?: string } | undefined;
  assert.equal(graphqlAnnotation?.mutation, 'mcpExecuteTool');
  assert.equal(
    NODE_SOURCE_RULES.some((rule) => rule.code === 'blocked_import' && rule.enforced === true),
    true,
  );
});

test('Giga MCP exposes workflow-native setup tools', () => {
  const names = new Set(GIGA_MCP_TOOLS.map((tool) => tool.name));
  for (const name of [
    'giga.manage_workflow',
    'giga.ensure_workflow',
    'giga.execute_workflow',
    'giga.list_workflow_versions',
    'giga.get_workflow_output',
    'giga.ensure_channel_assignment',
    'giga.get_workflow_execution',
    'giga.workflow_execution_logs',
    'giga.workflow_realtime_binding',
    'giga.run_tree_action',
    'giga.ensure_channel_path',
    'giga.ensure_knowledge_posts',
    'giga.list_chat_sessions',
    'giga.get_chat_session',
    'giga.list_chat_messages',
    'giga.publish_chat_share',
    'giga.revoke_chat_share',
    'giga.get_chat_share',
    'giga.shared_space_write_file',
    'giga.shared_space_mkdir',
    'giga.shared_space_checksum',
    'giga.chat_attachment_to_drive',
    'giga.run_querychat_prompt_suite',
    'giga.user_activity_logs',
    'giga.validate_node_package',
    'giga.import_node_package',
    'giga.export_node_package',
  ]) {
    assert.equal(names.has(name), true);
  }
});

test('workflow node package validation reads manifest and source rules from .node zip', async () => {
  // .node packaging is owned by @connectingmatrix/file in the active runtime.
  // This legacy test keeps the manifest payload local without reimplementing zip logic.
  const contentBase64 = Buffer.from(JSON.stringify({
    'node.json': JSON.stringify({
      packageType: 'giga.workflow.node',
      version: 1,
      name: 'Fixture Node',
      slug: 'fixture-node',
      groupName: 'Tests',
      nodeSchema: { id: 'fixture-node', fields: { operation: { type: 'select', options: [{ label: 'Run', value: 'run' }] } } },
      sourceFiles: ['worker.ts'],
    }),
    'worker.ts': 'export const execute = async () => ({ output: { ok: true } });',
  })).toString('base64');
  const result = await validateWorkflowNodePackage(contentBase64, 'fixture.node');
  assert.equal(result.report.ok, true);
  assert.deepEqual(result.files, ['worker.ts']);
  assert.equal(result.manifest.slug, 'fixture-node');
});

test('static node package review checks schema and source rules', () => {
  const report = reviewWorkflowNodePackageRules({
    nodeSchema: { id: 'bad-node', fields: { operation: { type: 'string' }, payload: { type: 'json' } } },
    sourceFiles: { 'worker.ts': "import fs from 'fs'; export const execute = async () => ({ output: true });" },
  });
  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some((entry) => entry.code === 'blocked_import'),
    true,
  );
  assert.equal(
    report.errors.some((entry) => entry.code === 'mode_field_not_select'),
    true,
  );
  assert.equal(
    report.warnings.some((entry) => entry.code === 'json_inspector_field'),
    true,
  );
});
