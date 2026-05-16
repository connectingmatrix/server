import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { liveMcpDescribe, liveMcpOrgId } from './mcp-live.constants';
import { startMcpLiveHarness, stopMcpLiveHarness, McpLiveHarness } from './mcp-live.harness';

let live: McpLiveHarness;

liveMcpDescribe('live MCP drive and tree/content tools', () => {
  before(async () => {
    live = await startMcpLiveHarness(23);
  });

  after(async () => stopMcpLiveHarness(live));

  it('creates scoped tree content and PHI-safe knowledge posts', async () => {
    const channel = await live.call('giga.ensure_channel_path', { path: live.paths.mcpChannelPath });
    live.ids.channels.add(channel.channelId);
    const category = await live.call('giga.run_tree_action', {
      action: 'create_category',
      input: {
        parent_channel_id: channel.channelId,
        category: { name: `MCP Live Artifacts ${live.runId}`, slug: `mcp-live-artifacts-${live.runId}` },
      },
    });
    live.ids.categories.add(category.data.category_id);
    const subject = await live.call('giga.run_tree_action', {
      action: 'create_subject',
      input: { name: `MCP Live Subject ${live.runId}`, category_id: category.data.category_id },
    });
    live.ids.subjects.add(subject.data.subject_id);
    const posts = await live.call('giga.ensure_knowledge_posts', {
      subjectId: subject.data.subject_id,
      posts: [{ title: `MCP Live Dataset Profile ${live.runId}`, narrative: 'PHI-safe live MCP fixture post.' }],
    });
    live.ids.posts.add(posts.posts[0].id);
    assert.equal(posts.count, 1);
  });

  it('does not remove subject CONTAINS hierarchy from unlink action', async () => {
    const channel = await live.call('giga.ensure_channel_path', { path: `${live.paths.mcpChannelPath}-links` });
    live.ids.channels.add(channel.channelId);
    const originalCategory = await live.call('giga.run_tree_action', {
      action: 'create_category',
      input: {
        parent_channel_id: channel.channelId,
        category: { name: `MCP Original ${live.runId}`, slug: `mcp-original-${live.runId}` },
      },
    });
    const linkedCategory = await live.call('giga.run_tree_action', {
      action: 'create_category',
      input: {
        parent_channel_id: channel.channelId,
        category: { name: `MCP Linked ${live.runId}`, slug: `mcp-linked-${live.runId}` },
      },
    });
    live.ids.categories.add(originalCategory.data.category_id);
    live.ids.categories.add(linkedCategory.data.category_id);
    const subject = await live.call('giga.run_tree_action', {
      action: 'create_subject',
      input: {
        name: `MCP Link Subject ${live.runId}`,
        category_id: originalCategory.data.category_id,
      },
    });
    live.ids.subjects.add(subject.data.subject_id);
    await live.call('giga.run_tree_action', {
      action: 'link_subject',
      input: { subject_id: subject.data.subject_id, category_id: linkedCategory.data.category_id },
    });
    const unlinked = await live.call('giga.run_tree_action', {
      action: 'unlink_subject',
      input: { subject_id: subject.data.subject_id, category_id: linkedCategory.data.category_id },
    });
    const readBack = await live.call('giga.run_tree_action', {
      action: 'read_subject',
      input: { subject_id: subject.data.subject_id },
    });
    assert.equal(unlinked.data.deletedCount, 0);
    assert.equal(readBack.data.subject.id, subject.data.subject_id);
  });

  it('performs shared-space CRUD with checksum metadata', async (t) => {
    const summary = await live.call('giga.shared_space_summary', { organizationId: liveMcpOrgId }).catch((error) => ({ error: error.message }));
    if (summary.error || summary.permissions?.allowCreate !== true || summary.permissions?.allowUpdate !== true) {
      t.skip(`Rich live user lacks SHARED_SPACE create/update on ${liveMcpOrgId}: ${summary.error || 'permission denied'}`);
      return;
    }
    const contentBase64 = Buffer.from(JSON.stringify({ runId: live.runId, ok: true })).toString('base64');
    await live.call('giga.shared_space_mkdir', { organizationId: liveMcpOrgId, path: live.paths.mcpDriveRoot });
    await live.call('giga.shared_space_write_file', {
      organizationId: liveMcpOrgId,
      path: `${live.paths.mcpDriveRoot}/artifact.json`,
      contentBase64,
    });
    const stat = await live.call('giga.shared_space_checksum', { organizationId: liveMcpOrgId, path: `${live.paths.mcpDriveRoot}/artifact.json` });
    assert.ok(stat.checksum);
    await live.call('giga.shared_space_copy', {
      organizationId: liveMcpOrgId,
      fromPath: `${live.paths.mcpDriveRoot}/artifact.json`,
      toPath: `${live.paths.mcpDriveRoot}/copy.json`,
    });
    await live.call('giga.shared_space_move', {
      organizationId: liveMcpOrgId,
      fromPath: `${live.paths.mcpDriveRoot}/copy.json`,
      toPath: `${live.paths.mcpDriveRoot}/moved.json`,
    });
    const listed = await live.call('giga.shared_space_list', { organizationId: liveMcpOrgId, path: live.paths.mcpDriveRoot });
    assert.equal(
      listed.some((item: any) => item.name === 'moved.json'),
      true,
    );
  });
});
