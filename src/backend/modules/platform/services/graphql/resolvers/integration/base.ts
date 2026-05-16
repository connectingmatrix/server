import { randomUUID } from 'crypto';
import { GraphqlConnection, GraphqlResolverContext } from '@giga/shared/types';
import { BadRequestError } from 'routing-controllers';
import { Service } from 'typedi';
import { getCurrentUserIdOrThrow, isCurrentUserRootUser } from '@giga/shared/lib/helper';
import { OrganisationEntity, WorkflowEntity } from '@connectingmatrix/orm/repositories/entities';
import type { WorkflowDefinition } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
import type { OrganizationAccessContext, OrganizationAction, OrganizationModule } from '@giga/shared/types/contracts/org.types';
import type { WorkflowNodeSearchRow, WorkflowRow } from '@giga/shared/types/contracts/graphql.types';

const resolveUser = async (context: GraphqlResolverContext) => {
  const userId = context.userId || context.graphqlContext?.userId || (await getCurrentUserIdOrThrow(context.supabase));
  const effectiveRoot =
    context.effectiveRoot === true || context.graphqlContext?.effectiveRoot === true || (await isCurrentUserRootUser(context.supabase));
  context.userId = userId;
  context.effectiveRoot = effectiveRoot;
  return { userId, effectiveRoot };
};

export const isSupportedOrganizationModule = (value: string): value is OrganizationModule => OrganisationEntity.isSupportedPermissionModule(value);

export const getCurrentUserOrganizationContext = async (context: GraphqlResolverContext, organizationId?: string | null) => {
  const user = await resolveUser(context);
  return OrganisationEntity.accessContext({
    supabase: context.supabase,
    userId: user.userId,
    organizationId: organizationId || null,
    context,
  });
};

export const canOrganizationAction = (access: OrganizationAccessContext, module: OrganizationModule, action: OrganizationAction) =>
  OrganisationEntity.canAccess(access, { module, action });

export const requireOrganizationManagerRole = async (context: GraphqlResolverContext, organizationId: string) => {
  const user = await resolveUser(context);
  if (user.effectiveRoot) return;
  await OrganisationEntity.requireAccess({ userId: user.userId, organizationId, effectiveRoot: user.effectiveRoot });
  const access = await OrganisationEntity.accessContext({
    supabase: context.supabase,
    userId: user.userId,
    organizationId,
    context,
  });
  if (!access.hasMembership) throw new BadRequestError('Inactive organizations are not accessible.');
  if (!access.isSuperAdmin) throw new BadRequestError('Only organization super admins can perform this action.');
};

export function isBooleanInput(value: unknown): value is boolean {
  return value === true || value === false;
}

export function getSupportedPermissionAction(value: unknown): OrganizationAction | null {
  if (value === 'create') return 'create';
  if (value === 'read') return 'read';
  if (value === 'update') return 'update';
  if (value === 'delete') return 'delete';
  if (value === 'execute') return 'execute';
  return null;
}

export function buildWorkflowMenuOptionsForUser(input: { canEditDefaultWorkflow: boolean; canEditUserWorkflow: boolean }): Array<{
  key: string;
  label: string;
  action: 'EDIT_DEFAULT_WORKFLOW' | 'EDIT_USER_WORKFLOW';
}> {
  if (input.canEditDefaultWorkflow && input.canEditUserWorkflow) {
    return [
      {
        key: 'edit-default-workflow',
        label: 'Edit Default Workflow',
        action: 'EDIT_DEFAULT_WORKFLOW',
      },
      {
        key: 'edit-user-workflow',
        label: 'Edit User Workflow',
        action: 'EDIT_USER_WORKFLOW',
      },
    ];
  }

  if (input.canEditDefaultWorkflow) {
    return [
      {
        key: 'edit-default-workflow',
        label: 'Edit Default Workflow',
        action: 'EDIT_DEFAULT_WORKFLOW',
      },
    ];
  }

  if (!input.canEditUserWorkflow) return [];

  return [
    {
      key: 'edit-user-workflow',
      label: 'Edit User Workflow',
      action: 'EDIT_USER_WORKFLOW',
    },
  ];
}

export function scopeTypeToTargetType(value?: string | null): 'CHANNEL' | 'CATEGORY' | 'SUBJECT' | 'POST' | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'CHANNEL' || normalized === 'CATEGORY' || normalized === 'SUBJECT' || normalized === 'POST') {
    return normalized;
  }
  return null;
}

export function requireWorkflowScopeType(value?: string | null): 'CHANNEL' | 'CATEGORY' | 'SUBJECT' | 'POST' {
  const normalized = scopeTypeToTargetType(value);
  if (!normalized) {
    throw new BadRequestError('Invalid workflow scope type.');
  }
  return normalized;
}

export function isRestrictedScope(accessContext: OrganizationAccessContext, scopeType?: string | null, scopeId?: string | null): boolean {
  const normalizedScopeType = scopeTypeToTargetType(scopeType);
  const normalizedScopeId = scopeId?.trim();
  if (!normalizedScopeType || !normalizedScopeId) return false;
  if (accessContext.bypassPermissions) return false;

  if (normalizedScopeType === 'CHANNEL') {
    return accessContext.deniedChannelIds.has(normalizedScopeId);
  }
  if (normalizedScopeType === 'CATEGORY') {
    return accessContext.deniedCategoryIds.has(normalizedScopeId);
  }
  if (normalizedScopeType === 'SUBJECT') {
    return accessContext.deniedSubjectIds.has(normalizedScopeId);
  }
  return accessContext.deniedPostIds.has(normalizedScopeId);
}

export function resourceTypeToOrganizationModule(value?: string | null): OrganizationModule | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'CHANNEL' || normalized === 'CATEGORY' || normalized === 'SUBJECT' || normalized === 'POST') {
    return normalized as OrganizationModule;
  }
  return null;
}

export function connection<T>(
  items: T[],
  options: {
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
    cursorOffset?: number;
  } = {},
): GraphqlConnection<T> {
  const cursorOffset = Number.isFinite(options.cursorOffset) ? Math.max(0, Number(options.cursorOffset)) : 0;
  const edges = items.map((node, index) => ({
    cursor: String(cursorOffset + index + 1),
    node,
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage: options.hasNextPage === true,
      hasPreviousPage: options.hasPreviousPage === true,
      startCursor: edges[0]?.cursor || null,
      endCursor: edges[edges.length - 1]?.cursor || null,
    },
  };
}

export function createWorkflowSecret(): string {
  return randomUUID().replace(/-/g, '');
}

export function buildWorkflowSearchText(workflow: WorkflowDefinition, description: string): string {
  const fragments = new Set<string>();
  const push = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase();
    if (normalized) fragments.add(normalized);
  };

  const metadata = workflow.metadata as
    | {
        name?: string | null;
        description?: string | null;
      }
    | undefined;

  push(metadata?.name);
  push(metadata?.description);
  push(description);

  for (const node of workflow.nodes ?? []) {
    const searchNode = node as unknown as WorkflowNodeSearchRow;
    push(searchNode.name);
    push(searchNode.description);
    push(searchNode.modelId);
    push(searchNode.gigaId);
  }

  return Array.from(fragments).join(' ');
}

export function withConnectionWindow<T>(rows: T[], first?: number | null, offset?: number | null): T[] {
  const normalizedOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;
  const normalizedFirst = Number.isFinite(first) ? Math.max(0, Number(first)) : rows.length;
  return rows.slice(normalizedOffset, normalizedOffset + normalizedFirst);
}

export async function requireRootUser(context: GraphqlResolverContext): Promise<void> {
  if (context.effectiveRoot !== true) {
    throw new BadRequestError('Only root users can manage global workflows.');
  }
}

export async function getResolverAuthContext(context: GraphqlResolverContext): Promise<{
  userId: string;
  effectiveRoot: boolean;
}> {
  const userId = context.userId || (await getCurrentUserIdOrThrow(context.supabase));
  const effectiveRoot = context.effectiveRoot === true || (await isCurrentUserRootUser(context.supabase));

  context.userId = userId;
  context.effectiveRoot = effectiveRoot;
  (context.supabase as any).__auth_user_id = userId;

  return {
    userId,
    effectiveRoot,
  };
}

export async function assertWorkflowScopeAssignmentAllowed(params: {
  currentUserId: string;
  defaultWorkflowId?: string | null;
  organizationId?: string | null;
  organizationWorkflowId?: string | null;
  action?: OrganizationAction;
  scopeId?: string | null;
  scopeType?: string | null;
  supabase: GraphqlResolverContext['supabase'];
  workflowId?: string | null;
}) {
  const scopeTargetType = scopeTypeToTargetType(params.scopeType);
  if (!scopeTargetType) {
    if (params.scopeType) {
      throw new BadRequestError('Invalid workflow scope type.');
    }
    return;
  }

  const actorContext = await OrganisationEntity.accessContext({
    supabase: params.supabase,
    userId: params.currentUserId,
    organizationId: params.organizationId ?? null,
  });
  OrganisationEntity.requirePermission(actorContext, {
    module: 'WORKFLOW',
    action: params.action || 'create',
    targetType: params.scopeId ? scopeTargetType : null,
    targetId: params.scopeId || null,
  });

  const workflowId = params.workflowId ?? null;
  const defaultWorkflowId = params.defaultWorkflowId ?? null;
  const organizationWorkflowId = params.organizationWorkflowId ?? null;
  const targetWorkflowId = workflowId || defaultWorkflowId || organizationWorkflowId;
  if (!targetWorkflowId) {
    return;
  }

  const columns = 'workflow,published_workflow,status,user_id,organization_id,is_global';
  let workflowRow: Record<string, unknown> | null = null;
  if (organizationWorkflowId) {
    const organizationId = params.organizationId ?? null;
    if (!organizationId) {
      throw new BadRequestError('organizationId is required for organization workflow assignments.');
    }
    workflowRow = await WorkflowEntity.readActiveOrganizationById(targetWorkflowId, organizationId, columns);
  } else if (defaultWorkflowId) {
    workflowRow = await WorkflowEntity.readActiveGlobalById(targetWorkflowId, columns);
  } else {
    workflowRow = await WorkflowEntity.readActivePersonalById(targetWorkflowId, params.currentUserId, columns);
  }
  if (!workflowRow) {
    return;
  }

  const row = workflowRow as WorkflowRow;
  const normalizedStatus = row.status?.toLowerCase();
  const workflow = normalizedStatus === 'published' && row.published_workflow ? row.published_workflow : row.workflow;
  if (workflow && WorkflowEntity.isWebhookBasedWorkflow(workflow)) {
    throw new BadRequestError('Webhook-based workflows cannot be attached to channel, category, subject, or post scopes.');
  }
}

@Service()
export class GraphqlCustomResolverModule {
  [key: string]: (...args: unknown[]) => any;

  getService(_target: unknown) {
    return this;
  }
}
