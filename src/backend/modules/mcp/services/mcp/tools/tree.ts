import { fetchMcpTree, runMcpTreeAction, ensureMcpChannelPath, ensureMcpKnowledgePosts } from '@giga/ai-actions/tree-actions';
import { actionRuntime } from './action-runtime';
import { boolProp, enforceKeys, jsonProp, requireRecord, schema, stringProp } from './common';
import type { GigaMcpToolGroup } from './common';

export const treeMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.fetch_tree': (context, args) => {
      const value = requireRecord('giga.fetch_tree args', args);
      enforceKeys('giga.fetch_tree args', value, [
        'organizationId',
        'rootId',
        'rootType',
        'includeGlobal',
        'chatId',
        'message',
        'topK',
        'scopeId',
        'scopeType',
        'resultsById',
      ]);
      return fetchMcpTree(actionRuntime(context, args), args);
    },
    'giga.run_tree_action': (context, args) => {
      const value = requireRecord('giga.run_tree_action args', args);
      enforceKeys('giga.run_tree_action args', value, [
        'action',
        'input',
        'dryRun',
        'chatId',
        'message',
        'topK',
        'scopeId',
        'scopeType',
        'resultsById',
      ]);
      return runMcpTreeAction(actionRuntime(context, args), args);
    },
    'giga.ensure_channel_path': (context, args) => {
      const value = requireRecord('giga.ensure_channel_path args', args);
      enforceKeys('giga.ensure_channel_path args', value, [
        'organizationId',
        'path',
        'segments',
        'dryRun',
        'chatId',
        'message',
        'topK',
        'scopeId',
        'scopeType',
        'resultsById',
      ]);
      return ensureMcpChannelPath(actionRuntime(context, args), args);
    },
    'giga.ensure_knowledge_posts': (context, args) => {
      const value = requireRecord('giga.ensure_knowledge_posts args', args);
      enforceKeys('giga.ensure_knowledge_posts args', value, [
        'organizationId',
        'subjectId',
        'subjectName',
        'categoryId',
        'posts',
        'updateExisting',
        'dryRun',
        'chatId',
        'message',
        'topK',
        'scopeId',
        'scopeType',
        'resultsById',
      ]);
      return ensureMcpKnowledgePosts(actionRuntime(context, args), args);
    },
  },
  tools: [
    {
      name: 'giga.fetch_tree',
      description: 'Fetch the scoped Giga channel/category/subject/post tree.',
      inputSchema: schema({
        organizationId: stringProp('Organization id'),
        rootId: stringProp('Root id'),
        rootType: stringProp('Root type'),
        includeGlobal: boolProp('Include global tree'),
      }),
    },
    {
      name: 'giga.run_tree_action',
      description: 'Run a permissioned Giga tree/content action such as create_channel, create_post, link_channel, or delete_post.',
      inputSchema: schema(
        { action: stringProp('Allowed Giga tree/content action name'), input: jsonProp('Action input'), dryRun: boolProp('Preview') },
        ['action'],
      ),
    },
    {
      name: 'giga.ensure_channel_path',
      description: 'Idempotently create or reuse a channel path in user or organization tree scope.',
      inputSchema: schema({
        organizationId: stringProp('Organization id'),
        path: stringProp('Slash-separated channel path'),
        segments: jsonProp('Channel path segments'),
        dryRun: boolProp('Preview'),
      }),
    },
    {
      name: 'giga.ensure_knowledge_posts',
      description: 'Idempotently create or update PHI-safe knowledge posts under a subject.',
      inputSchema: schema({
        organizationId: stringProp('Organization id'),
        subjectId: stringProp('Subject id'),
        subjectName: stringProp('Subject name'),
        categoryId: stringProp('Category id for subject creation'),
        posts: jsonProp('Post objects with title, narrative/content, and metadata'),
        updateExisting: boolProp('Update existing posts'),
        dryRun: boolProp('Preview'),
      }),
    },
  ],
};
