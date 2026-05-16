import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import { OrganisationEntity, WorkflowEntity, WorkflowExecutionEntity, WorkflowLogEntity } from '@connectingmatrix/orm/repositories/entities';
import { executeWorkflowManagementBackendRequest } from '@connectingmatrix/nodes/services/workflow/executor/runtime/backend-dispatch';
import { boolProp, jsonProp, limit, schema, stringList, stringProp, workflowScope } from './common';
import type { GigaMcpContext } from '../context';
import type { GigaMcpToolGroup } from './common';

const workflowBackendRequest = (context: GigaMcpContext, input: Record<string, unknown>) => ({
  context: {
    node: { id: 'mcp-workflow-management', name: 'MCP Workflow Management', modelId: 'workflow', properties: {}, runtime: {} },
    workflow: { metadata: { id: 'mcp', name: 'MCP' }, nodes: [], connections: [] },
    settings: {},
    input,
    hostContext: { requestContext: { request: context.request, supabase: context.supabase, userId: context.userId || '' } },
  },
  descriptor: { key: 'executeWorkflowManagementNode' },
  payload: { request: input },
  args: [],
});

const listWorkflows = async (context: GigaMcpContext, args: Record<string, unknown>) => {
  const scope = workflowScope(args.scope);
  const organizationId = toSafeString(args.organizationId);
  const max = limit(args.limit);
  let rows: Array<{ updated_at?: string | null; name?: string | null; id?: string | null }> = [];
  if (scope === 'organization') {
    if (!organizationId) throw new BadRequestError('organizationId is required.');
    await OrganisationEntity.requireAccess({
      userId: context.userId || '',
      organizationId,
      effectiveRoot: context.effectiveRoot === true,
    });
    rows = (await WorkflowEntity.listOrganizationCatalog({ organizationId, first: max, offset: 0 })).records as Array<{
      updated_at?: string | null;
      name?: string | null;
      id?: string | null;
    }>;
  } else if (scope === 'global') {
    rows = (await WorkflowEntity.listGlobalCatalog({ first: max, offset: 0 })).records as Array<{
      updated_at?: string | null;
      name?: string | null;
      id?: string | null;
    }>;
  } else {
    rows = (await WorkflowEntity.listPersonalCatalog({ userId: context.userId || '', first: max, offset: 0 })).records as Array<{
      updated_at?: string | null;
      name?: string | null;
      id?: string | null;
    }>;
  }
  return rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, max);
};

const manageWorkflow = async (context: GigaMcpContext, args: Record<string, unknown>) => {
  if (args.dryRun === true) return { action: toSafeString(args.operation || 'save'), input: args };
  const result = await executeWorkflowManagementBackendRequest(workflowBackendRequest(context, args) as any);
  if (result.status === 'failed')
    throw new BadRequestError(String((result.output as any)?.error || result.logs?.[0] || 'Workflow management failed.'));
  return result.output;
};

const ensureWorkflow = async (context: GigaMcpContext, args: Record<string, unknown>) => {
  const name = toSafeString(args.name || args.workflowName);
  if (!name) throw new BadRequestError('name is required.');
  const rows = await listWorkflows(context, { scope: args.scope, organizationId: args.organizationId, limit: 100 });
  const existing = (rows as any[]).find((row) => row.name === name);
  if (args.dryRun === true) return { action: existing ? (args.updateExisting === true ? 'update' : 'reuse') : 'create', existing };
  if (existing && args.updateExisting !== true) return existing;
  return manageWorkflow(context, { ...args, operation: 'save', saveMode: existing ? 'update' : 'create', workflowId: existing?.id, name });
};

const workflowRealtimeBinding = async (context: GigaMcpContext, args: Record<string, unknown>) => {
  const workflowId = toSafeString(args.workflowId);
  if (!workflowId) throw new BadRequestError('workflowId is required.');
  const broadcastId = toSafeString(args.broadcastId) || context.userId || '';
  return {
    path: '/ws/workflow',
    auth: 'Use the same Giga bearer/session token as the MCP request.',
    subscriptions: {
      catalog: {
        event: 'workflow:catalog:subscribe',
        payload: { broadcast_id: broadcastId, channel_name: toSafeString(args.channelName) || 'workflow-socket' },
      },
      execution: { event: 'workflow:execution:subscribe', payload: { broadcast_id: broadcastId, workflow_id: workflowId } },
    },
    events: ['workflow:catalog:status', 'workflow:execution:update', 'workflow:event'],
    runId: toSafeString(args.runId) || null,
    executionId: toSafeString(args.executionId) || null,
  };
};

export const workflowMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.list_workflows': listWorkflows,
    'giga.list_workflow_executions': async (_context, args) =>
      WorkflowExecutionEntity.listForWorkflow({
        workflowId: toSafeString(args.workflowId),
        first: limit(args.limit),
        offset: Number(args.offset) || 0,
      }),
    'giga.get_workflow_execution': async (_context, args) =>
      WorkflowExecutionEntity.getExecution({
        executionId: toSafeString(args.executionId),
        runId: toSafeString(args.runId),
        workflowId: toSafeString(args.workflowId),
      }),
    'giga.workflow_execution_logs': async (_context, args) =>
      WorkflowLogEntity.listForExecutionByReference({
        executionId: toSafeString(args.executionId),
        runId: toSafeString(args.runId),
        workflowId: toSafeString(args.workflowId),
        first: limit(args.limit, 100),
        offset: Number(args.offset) || 0,
      }),
    'giga.workflow_realtime_binding': workflowRealtimeBinding,
    'giga.workflow_running_statuses': (_context, args) =>
      WorkflowExecutionEntity.runningStatuses({
        workflowIds: stringList(args.workflowIds),
        organizationId: toSafeString(args.organizationId) || null,
        includeExecutions: args.includeExecutions === true,
      }),
    'giga.manage_workflow': manageWorkflow,
    'giga.ensure_workflow': ensureWorkflow,
    'giga.ensure_channel_assignment': (context, args) => manageWorkflow(context, { ...args, operation: 'attach' }),
  },
  tools: [
    {
      name: 'giga.list_workflows',
      description: 'List visible Giga workflows by user, organization, or global scope.',
      inputSchema: schema({
        scope: stringProp('user, organization, or global'),
        organizationId: stringProp('Organization id'),
        limit: jsonProp('Max 100'),
      }),
    },
    {
      name: 'giga.list_workflow_executions',
      description: 'List workflow execution logs for one workflow.',
      inputSchema: schema(
        {
          workflowId: stringProp('Workflow id'),
          scope: stringProp('Workflow scope'),
          organizationId: stringProp('Organization id'),
          limit: jsonProp('Max 100'),
          offset: jsonProp('Offset'),
          filter: jsonProp('Execution filter'),
        },
        ['workflowId'],
      ),
    },
    {
      name: 'giga.get_workflow_execution',
      description: 'Read one workflow execution by execution id or run id with permission checks.',
      inputSchema: schema(
        {
          workflowId: stringProp('Workflow id'),
          executionId: stringProp('Execution id'),
          runId: stringProp('Run id'),
          scope: stringProp('Workflow scope'),
          organizationId: stringProp('Organization id'),
        },
        ['workflowId'],
      ),
    },
    {
      name: 'giga.workflow_execution_logs',
      description: 'Read persisted workflow execution logs for one execution.',
      inputSchema: schema(
        {
          workflowId: stringProp('Workflow id'),
          executionId: stringProp('Execution id'),
          runId: stringProp('Run id'),
          scope: stringProp('Workflow scope'),
          organizationId: stringProp('Organization id'),
          limit: jsonProp('Max 100'),
          offset: jsonProp('Offset'),
        },
        ['workflowId'],
      ),
    },
    {
      name: 'giga.workflow_realtime_binding',
      description: 'Return socket path, subscription payloads, and events for listening to workflow execution updates.',
      inputSchema: schema(
        {
          workflowId: stringProp('Workflow id'),
          executionId: stringProp('Execution id'),
          runId: stringProp('Run id'),
          broadcastId: stringProp('Broadcast user id'),
          channelName: stringProp('Broadcast catalog channel'),
        },
        ['workflowId'],
      ),
    },
    {
      name: 'giga.workflow_running_statuses',
      description: 'Read running status for workflow ids.',
      inputSchema: schema({
        organizationId: stringProp('Organization id'),
        workflowIds: jsonProp('Workflow ids'),
        includeExecutions: boolProp('Include active execution ids and run ids'),
      }),
    },
    {
      name: 'giga.manage_workflow',
      description: 'Create, update, get, publish, attach, or delete a workflow through backend workflow management.',
      inputSchema: schema({
        operation: stringProp('list, get, save, publish, attach, or delete'),
        scope: stringProp('user or organization'),
        organizationId: stringProp('Organization id'),
        workflowId: stringProp('Workflow id'),
        name: stringProp('Workflow name'),
        workflow: jsonProp('Workflow JSON'),
        cypher: stringProp('Workflow Cypher'),
        publishAfterSave: boolProp('Publish after save'),
        dryRun: boolProp('Preview'),
      }),
    },
    {
      name: 'giga.ensure_workflow',
      description: 'Idempotently create, reuse, or update a scoped workflow by name.',
      inputSchema: schema(
        {
          scope: stringProp('user or organization'),
          organizationId: stringProp('Organization id'),
          name: stringProp('Workflow name'),
          workflow: jsonProp('Workflow JSON'),
          cypher: stringProp('Workflow Cypher'),
          updateExisting: boolProp('Update existing'),
          publishAfterSave: boolProp('Publish after save'),
          dryRun: boolProp('Preview'),
        },
        ['name'],
      ),
    },
    {
      name: 'giga.ensure_channel_assignment',
      description: 'Idempotently attach a workflow to a channel, category, subject, or post scope.',
      inputSchema: schema({
        scope: stringProp('user or organization'),
        organizationId: stringProp('Organization id'),
        workflowId: stringProp('Workflow id'),
        workflowName: stringProp('Workflow name'),
        scopeType: stringProp('CHANNEL, CATEGORY, SUBJECT, or POST'),
        scopeId: stringProp('Tree or post id'),
        scopeName: stringProp('Tree or post name'),
        dryRun: boolProp('Preview'),
      }),
    },
  ],
};
