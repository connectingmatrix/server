import '@giga/shared/test/dom-polyfills';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TREE_ACTION_NAMES } from '@giga/tree/services/giga/tree/integration/mcp';

const expectedTreeActions = [
  'fetch_user_tree',
  'read_channel',
  'read_category',
  'read_subject',
  'read_post',
  'read_attachments',
  'create_channel',
  'create_category',
  'create_subject',
  'create_post',
  'update_channel',
  'update_category',
  'update_subject',
  'update_post',
  'delete_channel',
  'delete_category',
  'delete_subject',
  'delete_post',
  'link_channel',
  'unlink_channel',
  'link_category',
  'unlink_category',
  'link_subject',
  'unlink_subject',
];

test('canonical tree action registry covers content CRUD and linking', () => {
  assert.deepEqual([...TREE_ACTION_NAMES].sort(), expectedTreeActions.sort());
});
