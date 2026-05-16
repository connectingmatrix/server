import { randomUUID } from 'node:crypto';
import { Executor } from '@workflow/executor';
import { readChatParityFixture } from '@connectingmatrix/chat/services/chat/workflow/runtime/chat-parity-fixtures';
import { bindWorkflowCredentials } from '@connectingmatrix/workflow-driver/services/workflow/runtime/bindWorkflowCredentials';
import { normalizeWorkflowSnapshotIdentity } from '@connectingmatrix/workflow-driver/services/workflow/runtime/workflow-identity';
import { buildWorkflowSearchText, createWorkflowSecret } from '@giga/general/services/graphql/resolvers/integration/base';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { mcpToolCypher } from './mcp-live.workflow-cypher';

export async function attachMcpToolParityWorkflow(input: {
  description: string;
  driveRoot: string;
  credentialId: string;
  ids: { workflows: Set<string> };
  organizationId: string;
  scopeId: string;
  userId: string;
}) {
  const fixture = readChatParityFixture('ai-agent');
  fixture.cypher += `\n${mcpToolCypher(input)}`;
  const compiled = Executor.compileWorkflowCypher({
    cypher: fixture.cypher,
    name: 'MCP Tool AI Agent Live',
    description: input.description,
    executable: true,
  });
  if (!compiled.validation.ok) throw new Error(compiled.validation.errors.join(' | '));
  const workflowId = randomUUID();
  const admin = SupabaseClientAdmin();
  const workflow = await bindWorkflowCredentials({
    workflow: compiled.workflow as any,
    scope: 'user',
    organizationId: null,
    supabase: admin,
    userId: input.userId,
    effectiveRoot: false,
  });
  const agent = workflow.nodes.find((node: any) => node.modelId === 'ai-agent') as any;
  agent.runtime.selectionPromptMd = `${agent.runtime.selectionPromptMd}\n\nUse connected generic tools for drive, MCP, node package, feature, model training, scoring, artifact, workflow save, and workflow execute tasks when the user names them. For RCM bootstrap requests, save the workflow first and then execute it. Model Scorer is a workflow step, not a standalone substitute for saving and running the workflow.`;
  agent.properties.selectionPromptMd = agent.runtime.selectionPromptMd;
  input.ids.workflows.add(workflowId);
  const name = `MCP Tool AI Agent Live ${input.scopeId.slice(0, 8)}`;
  const publishedWorkflow = normalizeWorkflowSnapshotIdentity({
    workflow,
    workflowId,
    workflowName: name,
    workflowDescription: input.description,
    workflowScope: 'user',
  });
  const now = new Date().toISOString();
  const saved = await admin
    .from('ai_workflows')
    .insert({
      id: workflowId,
      user_id: input.userId,
      name,
      description: input.description,
      workflow,
      published_workflow: publishedWorkflow,
      published_at: now,
      metadata: { live_test: 'mcp-tool-ai-agent', workflow_cypher: fixture.cypher },
      status: 'published',
      search_text: buildWorkflowSearchText(workflow, input.description),
      webhook_secret: createWorkflowSecret(),
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  if (saved.error) throw saved.error;
  const assignment = await admin
    .from('ai_workflow_assignments')
    .insert({
      id: randomUUID(),
      scope_type: 'CHANNEL',
      scope_id: input.scopeId,
      user_id: input.userId,
      workflow_id: workflowId,
      metadata: { live_test: 'mcp-tool-ai-agent' },
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  if (assignment.error) throw assignment.error;
  return { workflowId };
}
