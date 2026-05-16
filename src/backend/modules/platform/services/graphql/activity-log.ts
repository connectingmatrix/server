import type { GraphqlOperationContext, GraphqlProxyBody, TableInsert } from '@giga/shared/types';

function readText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function readEvent(name: string) {
  const value = name.toLowerCase();
  if (value.startsWith('auth') || value.startsWith('chat') || value.startsWith('agent') || value === 'workflowexecute' || value === 'withai')
    return null;
  if (value.includes('user_activity_logs') || value.includes('audit_logs')) return null;
  if (value.includes('delete') || value.startsWith('remove')) return 'DELETE';
  if (value.includes('execute')) return 'EXECUTE';
  if (value.includes('create') || value.startsWith('insertinto') || value.startsWith('add')) return 'CREATE';
  if (value.includes('update') || value.startsWith('upsert') || value.startsWith('activate') || value.startsWith('disable')) return 'UPDATE';
  if (value.includes('move') || value.includes('link') || value.includes('attach')) return 'UPDATE';
  return null;
}

function readSubject(name: string) {
  const value = name.toLowerCase();
  if (value.startsWith('insertinto') && value.endsWith('collection')) return value.slice(10, -10);
  if (value.startsWith('update') && value.endsWith('collection')) return value.slice(6, -10);
  if (value.startsWith('deletefrom') && value.endsWith('collection')) return value.slice(10, -10);
  if (value.includes('organizationpermission')) return 'organization_permission';
  if (value.includes('organizationmember')) return 'organization_member';
  if (value.includes('organizationnoderestriction')) return 'organization_node_restriction';
  if (value.includes('organizationcontentrestriction')) return 'organization_content_restriction';
  if (value.includes('organization')) return 'organization';
  if (value.includes('credential')) return 'credential';
  if (value.includes('workflowassignment')) return 'workflow_assignment';
  if (value.includes('workflowtypedefault')) return 'workflow_type_default';
  if (value.includes('workflow')) return 'workflow';
  if (value.includes('channel')) return 'channel';
  if (value.includes('category')) return 'category';
  if (value.includes('subject')) return 'subject';
  if (value.includes('post')) return 'post';
  if (value.includes('usernode')) return 'user_node';
  if (value.includes('user')) return 'user';
  return value;
}

export function buildUserActivityLogs(params: {
  body: GraphqlProxyBody;
  context: GraphqlOperationContext | null;
  payload: any;
}): TableInsert<'user_activity_logs'>[] {
  if (!params.context?.userId || params.context.operation.type !== 'mutation' || params.payload?.errors?.length) return [];
  const logs: TableInsert<'user_activity_logs'>[] = [];
  const variables = (params.body.variables || {}) as any;
  for (const field of params.context.operation.fields) {
    if (field.operation !== 'mutation') continue;
    const event = readEvent(field.name);
    if (!event) continue;
    const result = (params.payload?.data?.[field.key] || null) as any;
    const subject = readSubject(field.name);
    const isOrganizationSubject = subject === 'organization' || subject === 'organizations';
    const targetId = readText(
      result?.id,
      result?.records?.[0]?.id,
      variables?.input?.id,
      variables?.id,
      variables?.filter?.id?.eq,
      variables?.objects?.[0]?.id,
    );
    const organizationId = readText(
      result?.organizationId,
      result?.organization_id,
      result?.records?.[0]?.organization_id,
      variables?.input?.organizationId,
      variables?.input?.organization_id,
      variables?.organizationId,
      variables?.organization_id,
      variables?.filter?.organization_id?.eq,
      variables?.set?.organization_id,
      variables?.objects?.[0]?.organization_id,
      variables?.scope?.organizationId,
      subject === 'organization' || subject === 'organizations' ? targetId : null,
    );
    logs.push({
      user_id: params.context.userId,
      actor_user_id: params.context.userId,
      organization_id: isOrganizationSubject ? null : organizationId,
      event,
      actor: field.name,
      subject: targetId ? `${subject}:${targetId}` : subject,
      metadata: {
        source: 'graphql',
        fieldName: field.name,
        operationName: params.body.operationName || params.context.operation.name || null,
        organizationId: organizationId || (isOrganizationSubject ? targetId : null),
      },
    });
  }
  return logs;
}
