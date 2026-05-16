import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import { ACTIONS, actions, withActionName } from '@giga/ai-actions';
import { executeTreeAction, isTreeAction } from '@giga/ai-actions/tree-actions';
import {
  runFetchWorkflowNodeCatalog,
  runFetchWorkflowNodeDetails,
  runValidateWorkflowCypher,
  runCreateWorkflowFromCypher,
} from '@connectingmatrix/chat/services/chat/actions/runtime/workflow-cypher';
import { runUpdateWorkflowFromCypher } from '@connectingmatrix/chat/services/chat/actions/write/workflow-cypher-update';
import { runCreateWorkflow, runDeleteWorkflow, runUpdateWorkflow } from '@connectingmatrix/chat/services/chat/actions/runtime/workflow';
import { runExecuteWorkflow, runGetWorkflowOutput } from '@connectingmatrix/chat/services/chat/actions/runtime/workflow-execute';
import { runFetchAllWorkflows, runFetchWorkflow } from '@connectingmatrix/chat/services/chat/actions/read/workflow-read';
import { runFetchWorkflowRevisions, runFetchWorkflowRuns } from '@connectingmatrix/chat/services/chat/actions/read/workflow-history-read';
import { withEntityRequestContext } from '@connectingmatrix/orm/services/graphql/entity-request-context';
import { actionRuntime } from './action-runtime';
import { enforceKeys, inputRecord, jsonProp, requireRecord, schema, stringProp } from './common';
import type { GigaMcpToolGroup } from './common';
import type { AgentActionName } from '@giga/shared/types/contracts/agent.types';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

const CHAT_WORKFLOW_ACTIONS = new Set<AgentActionName>(ACTIONS.WORKFLOW.getActions().map((action) => action.name as AgentActionName));

const WORKFLOW_ACTION_RUNNERS: Partial<
  Record<AgentActionName, (runtime: ReturnType<typeof actionRuntime>, input: Record<string, unknown>) => Promise<unknown>>
> = {
  fetch_workflow_node_catalog: (runtime) => runFetchWorkflowNodeCatalog(runtime),
  fetch_workflow_node_details: (runtime, input) => runFetchWorkflowNodeDetails(runtime, input),
  validate_workflow_cypher: (runtime, input) => runValidateWorkflowCypher(runtime, input),
  create_workflow_from_cypher: (runtime, input) => runCreateWorkflowFromCypher(runtime, input),
  update_workflow_from_cypher: (runtime, input) => runUpdateWorkflowFromCypher(runtime, input),
  create_workflow: (runtime, input) => runCreateWorkflow(runtime, input),
  update_workflow: (runtime, input) => runUpdateWorkflow(runtime, input),
  delete_workflow: (runtime, input) => runDeleteWorkflow(runtime, input),
  execute_workflow: (runtime, input) => runExecuteWorkflow(runtime, input),
  get_workflow_output: (runtime, input) => runGetWorkflowOutput(runtime, input),
  fetch_all_workflows: (runtime, input) => runFetchAllWorkflows(runtime, input),
  fetch_workflow: (runtime, input) => runFetchWorkflow(runtime, input),
  fetch_workflow_runs: (runtime, input) => runFetchWorkflowRuns(runtime, input),
  fetch_workflow_revisions: (runtime, input) => runFetchWorkflowRevisions(runtime, input),
};

async function runWorkflowAction(action: AgentActionName, runtime: ReturnType<typeof actionRuntime>, input: Record<string, unknown>) {
  const runner = WORKFLOW_ACTION_RUNNERS[action];
  if (runner) return runner(runtime, input);
  throw new BadRequestError(`Unsupported workflow action "${action}".`);
}

function mcpEntityContext(
  context: Parameters<GigaMcpToolGroup['handlers']['giga.chat_run_action']>[0],
  payload: Record<string, unknown>,
): GraphqlResolverContext {
  return {
    request: context.request,
    supabase: context.supabase,
    body: {
      operationName: 'giga.chat_run_action',
      query: '',
      variables: payload,
    },
    graphqlContext: context.graphqlContext || null,
    userId: context.userId,
    effectiveRoot: context.effectiveRoot === true,
  };
}

export const chatActionMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.chat_run_action': async (context, args) => {
      const value = requireRecord('giga.chat_run_action args', args);
      enforceKeys('giga.chat_run_action args', value, ['action', 'input', 'chatId', 'message', 'topK', 'scopeId', 'scopeType', 'resultsById']);
      const action = toSafeString(args.action) as AgentActionName;
      if (!action) throw new BadRequestError('action is required.');
      const runtime = actionRuntime(context, args);
      const input = inputRecord(args.input);
      const payload = {
        action,
        chatId: toSafeString(args.chatId),
        input,
        message: toSafeString(args.message),
        resultsById: inputRecord(args.resultsById),
        scopeId: toSafeString(args.scopeId),
        scopeType: toSafeString(args.scopeType),
        topK: Number(args.topK) || 10,
      };
      return withEntityRequestContext(mcpEntityContext(context, payload), payload, async () => {
        if (isTreeAction(action)) return withActionName(action, await executeTreeAction(action, runtime, input));
        if (CHAT_WORKFLOW_ACTIONS.has(action)) return withActionName(action, await runWorkflowAction(action, runtime, input));
        const available = actions.list().map((entry) => entry.name);
        throw new BadRequestError(`Unsupported chat action "${action}". Available actions: ${available.join(', ')}`);
      });
    },
  },
  tools: [
    {
      name: 'giga.chat_run_action',
      description: 'Execute a chat planner action through MCP using the same runtime contract as the chat service.',
      inputSchema: schema(
        {
          action: stringProp('Agent action name'),
          input: jsonProp('Action input object'),
          chatId: stringProp('Chat id'),
          message: stringProp('User message'),
          topK: jsonProp('Top-k'),
          scopeId: stringProp('Scope id'),
          scopeType: stringProp('Scope type'),
          resultsById: jsonProp('Prior action results keyed by action id'),
        },
        ['action'],
      ),
    },
  ],
};
