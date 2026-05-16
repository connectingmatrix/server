import '@giga/shared/test/dom-polyfills';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const file = (path: string) => join(root, path);
const read = (path: string) => readFileSync(file(path), 'utf8');

const removedTreeFiles = [
  'src/services/giga/create-channel.ts',
  'src/services/giga/create-category.ts',
  'src/services/giga/delete-owned-branch.ts',
  'src/services/giga/fetch-user-tree.ts',
  'src/services/giga/link-channel.ts',
  'src/services/giga/link-category-to-channels.ts',
  'src/services/giga/link-subject-to-category.ts',
  'src/services/giga/move-channel.ts',
  'src/services/giga/tree-scope.ts',
  'src/services/post/create-post.ts',
  'src/services/subject/create-subject.ts',
  'src/services/giga/tree/create-channel.ts',
  'src/services/giga/tree/create-category.ts',
  'src/services/giga/tree/delete-owned-branch.ts',
  'src/services/giga/tree/fetch-user-tree.ts',
  'src/services/giga/tree/fetch-user-tree-organization-filter.ts',
  'src/services/giga/tree/link-channel.ts',
  'src/services/giga/tree/link-category-to-channels.ts',
  'src/services/giga/tree/link-subject-to-category.ts',
  'src/services/giga/tree/move-channel.ts',
  'src/services/giga/tree/post-create-action.ts',
  'src/services/giga/tree/post-read-action.ts',
  'src/services/giga/tree/post-record.ts',
  'src/services/giga/tree/subject-record.ts',
  'src/services/giga/tree/create.ts',
  'src/services/giga/tree/actions.ts',
  'src/services/giga/tree/read.ts',
  'src/services/giga/tree/resolve.ts',
  'src/services/giga/tree/scope.ts',
  'src/services/giga/tree/update.ts',
  'src/services/giga/tree/delete.ts',
  'src/services/giga/tree/link.ts',
  'src/services/giga/tree/graphql.ts',
  'src/services/giga/tree/attach-subject-to-category.ts',
  'src/services/giga/tree/attach-subject-to-graph.ts',
  'src/services/giga/tree/remove-subject-from-category.ts',
  'src/services/giga/tree/remove-subject-from-graph.ts',
  'src/services/chat/actions/content-create.ts',
  'src/services/chat/actions/content-delete-link.ts',
  'src/services/chat/actions/content-read.ts',
  'src/services/chat/actions/content-update.ts',
  'src/services/chat/actions/post-create.ts',
  'src/services/chat/actions/post-read.ts',
  'src/services/chat/actions/tree.ts',
];

const adapterFiles = [
  'packages/apps/chat/src/services/chat/actions/index.ts',
  'packages/apps/mcp/src/services/mcp/tools/tree.ts',
  'packages/apps/general/src/services/graphql/resolvers/integration/channel.resolver.ts',
  'packages/apps/general/src/services/graphql/resolvers/integration/category.resolver.ts',
  'packages/apps/general/src/services/graphql/resolvers/integration/subject.resolver.ts',
  'packages/apps/general/src/services/graphql/resolvers/integration/post.resolver.ts',
];

test('old tree implementation files are removed instead of re-exported', () => {
  assert.deepEqual(
    removedTreeFiles.filter((path) => existsSync(file(path))),
    [],
  );
});

test('adapters delegate tree mutations to the canonical tree service', () => {
  const forbidden = /(from\(['"]ai_(subjects|posts)['"]\)\s*\.(insert|update|upsert|delete)|deleteRelations|createRelation)/;
  for (const path of adapterFiles) assert.equal(forbidden.test(read(path)), false, path);
});

test('scoped agent guidance protects the tree service boundary', () => {
  const agents = [
    'packages/apps/general/src/services/giga/AGENTS.md',
    'packages/apps/tree/src/services/giga/tree/AGENTS.md',
    'packages/apps/tree/src/services/giga/tree/channel/AGENTS.md',
    'packages/apps/tree/src/services/giga/tree/category/AGENTS.md',
    'packages/apps/tree/src/services/giga/tree/subject/AGENTS.md',
    'packages/apps/tree/src/services/giga/tree/post/AGENTS.md',
    'packages/apps/chat/src/services/chat/actions/AGENTS.md',
    'packages/apps/mcp/src/services/mcp/tools/AGENTS.md',
    'packages/apps/workflow-nodes/src/services/workflow/nodes/AGENTS.md',
    'packages/apps/general/src/services/graphql/resolvers/AGENTS.md',
  ];
  assert.deepEqual(
    agents.filter((path) => !existsSync(file(path))),
    [],
  );
});
