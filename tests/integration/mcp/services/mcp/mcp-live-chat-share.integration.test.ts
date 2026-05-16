import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { liveMcpDescribe } from './mcp-live.constants';
import { startMcpLiveHarness, stopMcpLiveHarness, McpLiveHarness } from './mcp-live.harness';

let live: McpLiveHarness;

liveMcpDescribe('live MCP chat sessions, messages, prompt suites, and shares', () => {
  before(async () => {
    live = await startMcpLiveHarness(24);
  });

  after(async () => stopMcpLiveHarness(live));

  it('queries chat and manages share lifecycle through MCP', async () => {
    const scope = await live.call('giga.ensure_channel_path', { path: `${live.paths.mcpChannelPath}-chat` });
    live.ids.channels.add(scope.channelId);
    const chat = await live.call('giga.query_chat', {
      message: 'Give a one sentence PHI-safe summary for this MCP live test channel.',
      scope: { type: 'channel', id: scope.channelId },
      topK: 3,
    });
    live.ids.chats.add(chat.chat.id);
    assert.ok(chat.answer.text);
    const sessions = await live.call('giga.list_chat_sessions', { limit: 20 });
    assert.equal(
      sessions.data.some((row: any) => row.id === chat.chat.id),
      true,
    );
    const messages = await live.call('giga.list_chat_messages', { chatId: chat.chat.id, limit: 20 });
    assert.equal(messages.data.length >= 2, true);
    const suite = await live.call('giga.run_querychat_prompt_suite', {
      prompts: ['Give a one sentence test summary.'],
      scope: { type: 'channel', id: scope.channelId },
      topK: 2,
      sourceLimit: 2,
    });
    assert.equal(suite.count, 1);
    const share = await live.call('giga.publish_chat_share', { chatId: chat.chat.id });
    assert.ok(share.share_token || share.shareToken);
    const loaded = await live.call('giga.get_chat_share', { chatId: chat.chat.id });
    assert.ok(loaded.chat_id || loaded.chatId);
    const revoked = await live.call('giga.revoke_chat_share', { chatId: chat.chat.id });
    assert.ok(revoked.revoked_at || revoked.revokedAt);
  });
});
