import type { ActionContract, RoleGateContract } from '@giga/shared/types/contracts/integration-contract.types';

const roles: RoleGateContract[] = [
  { actor: 'User', canInvoke: true, constraints: ['MCP tool access inherits GraphQL resolver-access policy.'] },
  { actor: 'Root User', canInvoke: true, constraints: ['Root-level policy checks still apply.'] },
  { actor: 'Super Admin', canInvoke: true, constraints: ['Super-admin policy and org gates apply.'] },
];

const sources = ['packages/apps/mcp/src/services/mcp/tools.ts', 'packages/apps/mcp/src/services/mcp/graphql-proxy.ts'];

const tool = (actionName: string, group: string, description: string, inputSchema: Record<string, string>, mutating = false): ActionContract => ({
  packageName: '@giga/mcp',
  actionName,
  group,
  source: 'mcp',
  mutating,
  description,
  inputSchema,
  outputSchema: { actionName: 'string', result: 'tool-specific payload' },
  combinations: [
    {
      name: 'tool-call',
      required: [],
      optional: Object.keys(inputSchema),
      constraints: ['MCP execution goes through GraphQL mutation mcpExecuteTool.'],
    },
  ],
  roleGates: roles,
  sourcePaths: sources,
  notes: ['Tool names remain stable for compatibility with MCP clients.'],
});

export const ACTION_CONTRACTS: ActionContract[] = [
  tool('giga.me', 'identity', 'Read current identity + policy context.', {}),
  tool('giga.query_chat', 'chat', 'Execute chat query through MCP.', { message: 'string', chatMode: 'DEFAULT|AGENT|WORKFLOW|SWARM optional' }, true),
  tool('giga.list_chat_sessions', 'chat', 'List chat sessions visible to caller.', { first: 'number optional', offset: 'number optional' }),
  tool('giga.get_chat_session', 'chat', 'Read a chat session by id.', { chatId: 'uuid' }),
  tool('giga.list_chat_messages', 'chat', 'List messages for a chat.', { chatId: 'uuid', first: 'number optional', offset: 'number optional' }),
  tool('giga.chat_run_action', 'chat-actions', 'Execute consolidated ai-action by name.', { action: 'string', input: 'object optional' }, true),
  tool('giga.list_workflows', 'workflow', 'List workflows for current scope.', {
    first: 'number optional',
    offset: 'number optional',
    scope: 'string optional',
  }),
  tool(
    'giga.execute_workflow',
    'workflow',
    'Execute workflow through queue runtime.',
    { workflowId: 'uuid optional', workflow: 'object optional' },
    true,
  ),
  tool('giga.list_workflow_executions', 'workflow', 'List workflow executions.', {
    workflowId: 'uuid',
    first: 'number optional',
    offset: 'number optional',
  }),
  tool('giga.get_workflow_execution', 'workflow', 'Get one workflow execution snapshot.', { executionId: 'uuid' }),
  tool('giga.workflow_execution_logs', 'workflow', 'Fetch workflow execution logs.', { executionId: 'uuid' }),
  tool(
    'giga.manage_workflow',
    'workflow',
    'Create/update/delete workflow contract.',
    { operation: 'create|update|delete', workflow: 'object' },
    true,
  ),
  tool('giga.list_scoped_nodes', 'nodes', 'List scoped workflow nodes.', {}),
  tool('giga.get_scoped_node_source', 'nodes', 'Read scoped node source.', { id: 'uuid' }),
  tool('giga.create_scoped_node', 'nodes', 'Create scoped node package.', { name: 'string', sourceFiles: 'object' }, true),
  tool('giga.update_scoped_node', 'nodes', 'Update scoped node package.', { id: 'uuid', patch: 'object' }, true),
  tool('giga.delete_scoped_node', 'nodes', 'Delete scoped node package.', { id: 'uuid' }, true),
  tool('giga.import_node_package', 'nodes', 'Import node package archive.', { packageBase64: 'string' }, true),
  tool('giga.export_node_package', 'nodes', 'Export node package archive.', { id: 'uuid' }),
  tool('giga.fetch_tree', 'tree', 'Fetch user tree payload.', { rootId: 'uuid optional', depth: 'number optional' }),
  tool('giga.run_tree_action', 'tree', 'Execute tree domain action by name.', { action: 'string', input: 'object optional' }, true),
  tool('giga.shared_space_list', 'shared-space', 'List shared-space artifacts.', { path: 'string optional' }),
  tool('giga.shared_space_write_file', 'shared-space', 'Write shared-space file.', { path: 'string', content: 'string' }, true),
  tool('giga.shared_space_delete', 'shared-space', 'Delete shared-space file/folder.', { path: 'string' }, true),
  tool('giga.user_activity_logs', 'audit', 'Read audited user activity logs.', { first: 'number optional', offset: 'number optional' }),
];

export const NO_ACTION_SURFACE_REASON = '';
