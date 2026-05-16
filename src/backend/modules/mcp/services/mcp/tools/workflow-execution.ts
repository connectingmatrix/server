import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import { executeWorkflowMutation } from '@connectingmatrix/workflow-driver/services/workflow';
import { isCurrentUserRootUser } from '@giga/shared/lib/helper';
import {
  OrganisationEntity,
  PlanPolicyEntity,
  WorkflowEntity,
  WorkflowExecutionEntity,
  WorkflowVersionEntity,
  assertBillingExecutionAccess,
} from '@connectingmatrix/orm/repositories/entities';
import { WorkflowAuthModeEnum, WorkflowExecutionModeEnum } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
import { boolProp, inputRecord, jsonProp, schema, stringProp, workflowScope } from './common';
import type { GigaMcpContext } from '../context';
import type { GigaMcpToolGroup } from './common';
import type { WorkflowRuntimeSettings } from '@giga/shared/types/contracts/workflow.types';

const workflowOrgId = (workflow: Record<string, any>, args: Record<string, unknown>) =>
  toSafeString(args.organizationId || workflow.metadata?.organizationId || workflow.metadata?.scope?.organizationId) || null;

const stringHeaders = (value: unknown) => {
  const record = inputRecord(value);
  return Object.keys(record).reduce<Record<string, string>>((headers, key) => {
    const next = toSafeString(record[key]);
    if (next) headers[key] = next;
    return headers;
  }, {});
};

const loadWorkflow = async (context: GigaMcpContext, args: Record<string, unknown>) => {
  const inline = inputRecord(args.workflow);
  if (Object.keys(inline).length) return inline;
  const workflowId = toSafeString(args.workflowId);
  if (!workflowId) throw new BadRequestError('workflowId or workflow is required.');
  const reference = await WorkflowEntity.resolveReference({
    currentUserId: context.userId || '',
    organizationId: toSafeString(args.organizationId) || null,
    scope: workflowScope(args.scope),
    workflowId,
  });
  if (!reference) throw new BadRequestError('Workflow was not found or is not accessible.');
  const workflow = await WorkflowEntity.single(workflowId);
  return inputRecord(workflow?.workflow);
};

const realtime = (context: GigaMcpContext, workflowId: string, result: Record<string, unknown>) => ({
  path: '/ws/workflow',
  subscriptions: {
    catalog: { event: 'workflow:catalog:subscribe', payload: { broadcast_id: context.userId || '', channel_name: 'workflow-socket' } },
    execution: { event: 'workflow:execution:subscribe', payload: { broadcast_id: context.userId || '', workflow_id: workflowId } },
  },
  events: ['workflow:catalog:status', 'workflow:execution:update', 'workflow:event'],
  executionId: result.execution_id || null,
  runId: result.run_id || null,
});

const executeWorkflow = async (context: GigaMcpContext, args: Record<string, unknown>) => {
  const workflow = await loadWorkflow(context, args);
  const metadata = inputRecord(workflow.metadata);
  const organizationId = workflowOrgId(workflow, args);
  if (args.dryRun === true) return { action: 'execute_workflow', organizationId, workflowId: metadata.id || args.workflowId };
  await assertBillingExecutionAccess(context.supabase, {
    userId: context.userId || '',
    effectiveRoot: context.effectiveRoot === true,
    organizationId,
  });
  const limits = await PlanPolicyEntity.workflowRuntimeLimits({
    effectiveRoot: context.effectiveRoot === true,
    organizationId,
    userId: context.userId || '',
    context,
  });
  const requestedSettings = inputRecord(args.settings);
  const baseSettings = {
    graphqlUrl: toSafeString(requestedSettings.graphqlUrl),
    httpBaseUrl: toSafeString(requestedSettings.httpBaseUrl) || undefined,
    authMode: WorkflowAuthModeEnum.AutoFromCurrentSession,
    manualHeaders: stringHeaders(requestedSettings.manualHeaders),
    maxConcurrentExecutionsPerUser: limits.maxConcurrentExecutionsPerUser,
    maxExecutionSeconds: Math.min(Number(requestedSettings.maxExecutionSeconds) || limits.maxExecutionSeconds, limits.maxExecutionSeconds),
  };
  const effectiveRoot = await isCurrentUserRootUser(context.supabase).catch(() => false);
  const organization = organizationId ? (OrganisationEntity.load(organizationId) as OrganisationEntity) : null;
  const sharedDrive = organization
    ? await organization.sharedSpace.workflowDrive({
        request: context.request,
        supabase: context.supabase,
        userId: context.userId || '',
        effectiveRoot,
      })
    : null;
  const settings = { ...baseSettings, sharedDrive } as WorkflowRuntimeSettings;
  const result = await executeWorkflowMutation({
    input: {
      workflow: workflow as any,
      settings,
      mode: args.mode === 'wait' ? WorkflowExecutionModeEnum.Wait : WorkflowExecutionModeEnum.Async,
      request_id: toSafeString(args.requestId) || null,
      broadcast_id: toSafeString(args.broadcastId) || context.userId || null,
      broadcast_channel_name: toSafeString(args.broadcastChannelName) || 'workflow-socket',
    },
    requestContext: { request: context.request, supabase: context.supabase, userId: context.userId || '' },
  });
  return { ...result, realtime: realtime(context, toSafeString(metadata.id || args.workflowId), result as any) };
};

export const workflowExecutionMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.execute_workflow': executeWorkflow,
    'giga.list_workflow_versions': (context, args) =>
      WorkflowVersionEntity.listForWorkflow({
        workflowId: toSafeString(args.workflowId),
        first: 100,
        offset: 0,
      }),
    'giga.get_workflow_output': async (_context, args) => {
      const execution = await WorkflowExecutionEntity.getExecution({
        executionId: toSafeString(args.executionId),
        runId: toSafeString(args.runId),
        workflowId: toSafeString(args.workflowId),
      });
      const row = (execution?.payload || {}) as Record<string, unknown>;
      return {
        executionId: execution?.id || null,
        runId: String(row.run_id || execution?.id || ''),
        status: execution?.status || null,
        output: row.output_payload || null,
      };
    },
  },
  tools: [
    {
      name: 'giga.execute_workflow',
      description: 'Execute a workflow directly through the same backend queue as GraphQL workflowExecute.',
      inputSchema: schema({
        workflowId: stringProp('Workflow id'),
        workflow: jsonProp('Workflow JSON'),
        scope: stringProp('user, organization, or global'),
        organizationId: stringProp('Organization id'),
        settings: jsonProp('Runtime settings'),
        mode: stringProp('async or wait'),
        requestId: stringProp('Run id'),
        broadcastId: stringProp('Broadcast user id'),
        broadcastChannelName: stringProp('Broadcast channel'),
        dryRun: boolProp('Preview'),
      }),
    },
    {
      name: 'giga.list_workflow_versions',
      description: 'List published workflow versions and execution counts.',
      inputSchema: schema({ workflowId: stringProp('Workflow id'), scope: stringProp('Scope'), organizationId: stringProp('Organization id') }, [
        'workflowId',
      ]),
    },
    {
      name: 'giga.get_workflow_output',
      description: 'Read stored workflow execution output by execution id or run id.',
      inputSchema: schema(
        {
          workflowId: stringProp('Workflow id'),
          executionId: stringProp('Execution id'),
          runId: stringProp('Run id'),
          scope: stringProp('Scope'),
          organizationId: stringProp('Organization id'),
        },
        ['workflowId'],
      ),
    },
  ],
};
