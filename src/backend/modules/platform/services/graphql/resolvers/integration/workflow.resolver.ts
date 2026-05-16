import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import {
  GraphqlResolverContext,
  WithAIArgs,
  WorkflowCollectionObject,
  WorkflowCollectionQueryArgs,
  WorkflowCatalogRecordsArgs,
  WorkflowDeleteArgs,
  WorkflowExecutionArgs,
  WorkflowExecutionsArgs,
  WorkflowInsertArgs,
  WorkflowRunningStatusesArgs,
  WorkflowUpdateArgs,
  WorkflowUserNodeArgs,
  WorkflowUserNodeCreateArgs,
  WorkflowUserNodeUpdateArgs,
  WorkflowUserNodesArgs,
  WorkflowNodePackageArgs,
  WorkflowNodePackageExportArgs,
  WorkflowVersionsArgs,
} from '@giga/shared/types';
import { filterEq, filterIlike, safeParseJson, sortRows, stripCodeFences, toSafeString } from 'giga-ai-helper';
import { BadRequestError } from 'routing-controllers';
import { Service } from 'typedi';
import { invalidateGraphqlCache, runNamedGraphqlCache } from '@giga/shared/cache';
import { EnvLoader } from '@giga/shared/lib/env';
import { getCurrentUserIdOrThrow } from '@giga/shared/lib/helper';
import { readUserMatrixState } from '@giga/permissions/manifest/user-matrix';
import {
  assertBillingExecutionAccess,
  OrganisationEntity,
  PlanPolicyEntity,
  UsageEventEntity,
  WorkflowAssignmentEntity,
  WorkflowExecutionEntity,
  WorkflowEntity,
  WorkflowVersionEntity,
} from '@connectingmatrix/orm/repositories/entities';
import { resolveChatWorkflow } from '@connectingmatrix/chat/services/chat/workflow/runtime/workflow-chat';
import { listWorkflowExecutionOptions } from '@connectingmatrix/workflow-driver/services/workflow/contracts/execution-reference';
import { openai } from '@giga/shared/services/common/openai-client';
import { executeWorkflowMutation } from '@connectingmatrix/workflow-driver/services/workflow';
import {
  createUserWorkflowNode,
  deleteUserWorkflowNode,
  exportWorkflowNodePackage,
  getUserWorkflowNodeById,
  importWorkflowNodePackage,
  listUserWorkflowNodes,
  updateUserWorkflowNode,
  validateWorkflowNodePackage,
} from '@connectingmatrix/nodes/services/workflow/user-nodes';
import { normalizeSourceFiles, validateNodeSchema } from '@connectingmatrix/nodes/services/workflow/user-nodes/io/normalize';
import { reviewWorkflowNodePackageRules } from '@connectingmatrix/nodes/services/workflow/user-nodes/runtime/rules';
import { WorkflowAuthModeEnum, WorkflowDefinition, WorkflowExecutionModeEnum } from '@connectingmatrix/workflow-driver/services/workflow/contracts/types';
import { buildPermissionContext } from '@giga/permissions/services/auth/permission-context';
import { PermissionContextKey } from '@giga/general/services/graphql/resolver-access.constants';
import {
  GraphqlCustomResolverModule,
  connection,
  getResolverAuthContext,
  isRestrictedScope,
  requireRootUser,
  requireWorkflowScopeType,
  withConnectionWindow,
} from './base';
import type { OrganizationAccessContext } from '@giga/shared/types/contracts/org.types';
import type { WorkflowRuntimeSettings } from '@giga/shared/types/contracts/workflow.types';

const organizationAccessContext = (context: GraphqlResolverContext): OrganizationAccessContext | null =>
  (context.organizationPermissionResults?.[PermissionContextKey.ORGANIZATION_ACCESS] || null) as OrganizationAccessContext | null;

const invalidateWorkflowGraphqlCache = (input?: { organizationId?: string | null; workflowId?: string | null }) => {
  const tags = ['workflow:catalog:', 'workflow:running:'];
  if (input?.workflowId) {
    tags.push(`workflow:record:${input.workflowId}`, `workflow:history:${input.workflowId}`);
  }
  if (input?.organizationId) {
    tags.push(`workflow:organization:${input.organizationId}`);
  }
  invalidateGraphqlCache(tags);
};

const workflowCatalogString = (value: unknown) => toSafeString(value).trim();

const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestError(`${label} must be an object.`);
  return value as Record<string, unknown>;
};

const enforceKeys = (label: string, value: Record<string, unknown>, keys: readonly string[]) => {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new BadRequestError(`${label}.${key} is not supported.`);
};

const readPositiveInteger = (value: unknown, label: string): number => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new BadRequestError(`${label} must be a positive integer.`);
  return Math.floor(number);
};

type WorkflowAssignmentCollectionFilter = {
  id?: unknown;
  workflow_id?: unknown;
  scope_id?: unknown;
  user_id?: unknown;
  organization_id?: unknown;
  scope_type?: unknown;
};
type WorkflowVersionCollectionFilter = {
  id?: { eq?: string | null } | null;
  workflow_id?: { eq?: string | null } | null;
  published_by_user_id?: { eq?: string | null } | null;
  is_current?: { eq?: boolean | null } | null;
  workflow_name?: { ilike?: string | null } | null;
};

const chatWorkflowScope = (value: unknown): 'channel' | 'category' | 'subject' | 'post' => {
  const normalized = workflowCatalogString(value).toLowerCase();
  if (normalized === 'channel' || normalized === 'category' || normalized === 'subject' || normalized === 'post') return normalized;
  throw new BadRequestError('Invalid chat workflow scope type.');
};

function normalizeFilterText(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function hasEqFilter(filterValue: unknown): filterValue is { eq: unknown } {
  return Boolean(filterValue && typeof filterValue === 'object' && Object.prototype.hasOwnProperty.call(filterValue, 'eq'));
}

function hasInFilter(filterValue: unknown): filterValue is { in: unknown[] } {
  return Boolean(filterValue && typeof filterValue === 'object' && Object.prototype.hasOwnProperty.call(filterValue, 'in'));
}

function getEqFilterValue(filterValue: unknown): string | null | undefined {
  if (!hasEqFilter(filterValue)) return undefined;
  if ((filterValue as any).eq == null) return null;
  const normalized = String((filterValue as any).eq).trim();
  return normalized || null;
}

function getInFilterValues(filterValue: unknown, normalize: (value: unknown) => string | null = normalizeFilterText): string[] | undefined {
  if (!hasInFilter(filterValue)) return undefined;
  const values = Array.isArray((filterValue as any).in) ? (filterValue as any).in : [];
  return values.reduce((result: string[], value: unknown) => {
    const normalized = normalize(value);
    if (normalized) result.push(normalized);
    return result;
  }, []);
}

function getNullFilterValue(filterValue: unknown): 'NULL' | 'NOT_NULL' | undefined {
  if (!filterValue || typeof filterValue !== 'object' || !Object.prototype.hasOwnProperty.call(filterValue, 'is')) return undefined;
  const normalized = String((filterValue as any).is || '')
    .trim()
    .toUpperCase();
  if (normalized === 'NULL' || normalized === 'NOT_NULL') return normalized;
  return undefined;
}

function applyNullableFilter(query: any, column: string, filterValue: unknown, normalize: (value: unknown) => string | null = normalizeFilterText) {
  const nullFilter = getNullFilterValue(filterValue);
  if (nullFilter === 'NULL') return query.is(column, null);
  if (nullFilter === 'NOT_NULL') return query.not(column, 'is', null);
  const inValues = getInFilterValues(filterValue, normalize);
  if (inValues !== undefined) return query.in(column, inValues.length ? inValues : ['']);
  const value = getEqFilterValue(filterValue);
  if (value === undefined) return query;
  if (value === null) return query.is(column, null);
  const normalized = normalize(value);
  if (normalized === null) return query.is(column, null);
  return query.eq(column, normalized);
}

function normalizeNullableId(value: unknown): string | null {
  return normalizeFilterText(value);
}

export function applyWorkflowAssignmentCollectionFilter(query: any, filter: WorkflowAssignmentCollectionFilter = {}) {
  query = applyNullableFilter(query, 'id', filter.id);
  query = applyNullableFilter(query, 'workflow_id', filter.workflow_id);
  query = applyNullableFilter(query, 'scope_id', filter.scope_id);
  query = applyNullableFilter(query, 'user_id', filter.user_id);
  query = applyNullableFilter(query, 'organization_id', filter.organization_id);
  query = applyNullableFilter(query, 'scope_type', filter.scope_type, requireWorkflowScopeType);
  return query;
}

function matchesWorkflowAssignmentFilterValue(
  rowValue: unknown,
  filterValue: unknown,
  normalize: (value: unknown) => string | null = normalizeFilterText,
) {
  const nullFilter = getNullFilterValue(filterValue);
  if (nullFilter === 'NULL') return rowValue == null;
  if (nullFilter === 'NOT_NULL') return rowValue != null;
  const inValues = getInFilterValues(filterValue, normalize);
  if (inValues !== undefined) return inValues.includes(normalize(rowValue));
  const eqValue = getEqFilterValue(filterValue);
  if (eqValue === undefined) return true;
  if (eqValue === null) return rowValue == null;
  return normalize(rowValue) === normalize(eqValue);
}

function filterWorkflowAssignmentRows(rows: Array<Record<string, unknown>>, filter: WorkflowAssignmentCollectionFilter = {}) {
  return rows.filter((row) => {
    if (!matchesWorkflowAssignmentFilterValue(row.id, filter.id)) return false;
    if (!matchesWorkflowAssignmentFilterValue(row.workflow_id, filter.workflow_id)) return false;
    if (!matchesWorkflowAssignmentFilterValue(row.scope_id, filter.scope_id)) return false;
    if (!matchesWorkflowAssignmentFilterValue(row.user_id, filter.user_id)) return false;
    if (!matchesWorkflowAssignmentFilterValue(row.organization_id, filter.organization_id)) return false;
    if (!matchesWorkflowAssignmentFilterValue(row.scope_type, filter.scope_type, requireWorkflowScopeType)) return false;
    return true;
  });
}

function readWorkflowOrganizationId(workflow?: WorkflowDefinition | null) {
  const metadata = workflow?.metadata as Record<string, any> | undefined;
  const scope = metadata?.scope as Record<string, any> | undefined;
  return String(scope?.organizationId || metadata?.organizationId || '').trim() || null;
}

@Service()
export class WorkflowResolver extends GraphqlCustomResolverModule {
  @resolver('workflowCatalogRecords', GraphQLOperationType.QUERY)
  async workflowCatalogRecords({ input }: WorkflowCatalogRecordsArgs = {}, context: GraphqlResolverContext) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    const value = input ? requireRecord(input, 'workflowCatalogRecords.input') : {};
    enforceKeys('workflowCatalogRecords.input', value, ['pagination', 'first', 'offset', 'organizationIds', 'scope', 'search', 'sort']);
    let first = 50;
    let offset = 0;
    if (value.pagination) {
      const parsed = requireRecord(value.pagination, 'workflowCatalogRecords.input.pagination');
      enforceKeys('workflowCatalogRecords.input.pagination', parsed, ['first', 'offset']);
      first = readPositiveInteger(parsed.first, 'workflowCatalogRecords.input.pagination.first');
      offset = readPositiveInteger(parsed.offset, 'workflowCatalogRecords.input.pagination.offset');
    }
    if (value.first !== undefined && value.first !== null) first = readPositiveInteger(value.first, 'workflowCatalogRecords.input.first');
    if (value.offset !== undefined && value.offset !== null) offset = readPositiveInteger(value.offset, 'workflowCatalogRecords.input.offset');
    let organizationIds: string[] | undefined;
    if (value.organizationIds !== undefined && value.organizationIds !== null) {
      if (!Array.isArray(value.organizationIds)) throw new BadRequestError('workflowCatalogRecords.input.organizationIds must be an array.');
      organizationIds = value.organizationIds.map((id) => workflowCatalogString(id)).filter(Boolean);
    }
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'workflowCatalogRecords',
      read: async () => {
        const page = await WorkflowEntity.listAccessibleCatalog({
          userId: currentUserId,
          effectiveRoot,
          first,
          offset,
          organizationIds,
          scope: workflowCatalogString(value.scope) || null,
          search: workflowCatalogString(value.search) || null,
        });
        return { ...page, records: page.records.map((record) => record.extract()) };
      },
      userId: currentUserId,
      variables: { input },
    });
  }

  @resolver('workflowRecord', GraphQLOperationType.QUERY)
  async workflowRecord({ id }: { id?: string | null } = {}, context: GraphqlResolverContext) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    const workflowId = workflowCatalogString(id);
    if (!workflowId) throw new BadRequestError('workflowRecord.id is required.');
    const row = await WorkflowEntity.readAccessibleRecord({ workflowId, userId: currentUserId, effectiveRoot });
    if (!row) throw new BadRequestError(`Workflow ${workflowId} was not found or is not accessible.`);
    return row.extract();
  }

  @resolver('ai_workflowsCollection', GraphQLOperationType.QUERY)
  async aiWorkflowsCollection({ first, offset, orderBy, filter }: WorkflowCollectionQueryArgs = {}, context: GraphqlResolverContext) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'aiWorkflowsCollection',
      read: async () => {
        const requestedUserId = filter?.user_id?.eq ?? currentUserId;
        if (requestedUserId !== currentUserId && !effectiveRoot) {
          return connection([]);
        }

        let rows = (await WorkflowEntity.find({
          user_id: requestedUserId,
          is_active: true,
        })
          .whereNull('organization_id')
          .select(WorkflowEntity.catalogColumns())
          .many()) as unknown as WorkflowCollectionObject[];
        rows = filterEq(rows, (row) => row.id, filter?.id?.eq ?? null);
        rows = filterEq(rows, (row) => row.is_active, filter?.is_active?.eq);
        rows = filterIlike(rows, (row) => row.search_text, filter?.search_text?.ilike);
        rows = sortRows(rows, orderBy);
        const normalizedOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;
        const pagedRows = withConnectionWindow(rows, first, offset);
        return connection(pagedRows, {
          hasNextPage: normalizedOffset + pagedRows.length < rows.length,
          hasPreviousPage: normalizedOffset > 0,
          cursorOffset: normalizedOffset,
        });
      },
      userId: currentUserId,
      variables: {
        filter,
        first,
        offset,
        orderBy,
        workflowId: filter?.id?.eq ?? null,
      },
    });
  }

  @resolver('ai_workflow_executionsCollection', GraphQLOperationType.QUERY)
  async aiWorkflowExecutionsCollection({ first, offset, orderBy, filter }: WorkflowCollectionQueryArgs = {}, context: GraphqlResolverContext) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'aiWorkflowExecutionsCollection',
      read: async () => {
        const requestedUserId = filter?.user_id?.eq ?? currentUserId;
        if (requestedUserId !== currentUserId && !effectiveRoot) {
          return connection([]);
        }
        let query = WorkflowExecutionEntity.find({
          user_id: requestedUserId,
        });
        const workflowId = getEqFilterValue((filter as Record<string, unknown> | undefined)?.workflow_id);
        const runId = getEqFilterValue((filter as Record<string, unknown> | undefined)?.run_id);
        const status = getEqFilterValue((filter as Record<string, unknown> | undefined)?.status);
        const id = getEqFilterValue(filter?.id);
        if (workflowId) query = query.where({ workflow_id: workflowId });
        if (runId) query = query.where({ run_id: runId });
        if (status) query = query.where({ status });
        if (id) query = query.where({ id });
        let rows = (await query
          .select('id,workflow_id,workflow_version_id,status,run_id,created_at,updated_at,user_id')
          .orderBy('created_at', 'desc')
          .limit(100)
          .many()) as unknown as WorkflowCollectionObject[];
        rows = sortRows(rows, orderBy);
        const normalizedOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;
        const pagedRows = withConnectionWindow(rows, first, offset);
        return connection(pagedRows, {
          hasNextPage: normalizedOffset + pagedRows.length < rows.length,
          hasPreviousPage: normalizedOffset > 0,
          cursorOffset: normalizedOffset,
        });
      },
      userId: currentUserId,
      variables: {
        filter,
        first,
        offset,
        orderBy,
      },
    });
  }

  @resolver('ai_workflow_versionsCollection', GraphQLOperationType.QUERY)
  async aiWorkflowVersionsCollection({ first, offset, orderBy, filter }: WorkflowCollectionQueryArgs = {}, context: GraphqlResolverContext) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    const versionFilter = (filter || {}) as WorkflowVersionCollectionFilter;
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'aiWorkflowVersionsCollection',
      read: async () => {
        const personalWorkflowRows = await WorkflowEntity.find({
          user_id: currentUserId,
          is_active: true,
        })
          .whereNull('organization_id')
          .select('id')
          .many();
        const personalWorkflowIds = personalWorkflowRows.map((row) => String(row.id || '').trim()).filter(Boolean);
        const workflowId = String(versionFilter.workflow_id?.eq || '').trim();
        if (!effectiveRoot && workflowId && !personalWorkflowIds.includes(workflowId)) return connection([]);

        let query = WorkflowVersionEntity.find();
        if (!workflowId) {
          if (!personalWorkflowIds.length) return connection([]);
          query = query.whereIn('workflow_id', personalWorkflowIds);
        }
        if (workflowId) query = query.where({ workflow_id: workflowId });
        const id = String(versionFilter.id?.eq || '').trim();
        if (id) query = query.where({ id });
        const publishedByUserId = String(versionFilter.published_by_user_id?.eq || '').trim();
        if (publishedByUserId) query = query.where({ published_by_user_id: publishedByUserId });

        let rows = (await query.orderBy('created_at', 'desc').limit(100).many()) as unknown as WorkflowCollectionObject[];
        rows = filterEq(rows, (row) => row.is_current, versionFilter.is_current?.eq);
        rows = filterIlike(rows, (row) => row.workflow_name, versionFilter.workflow_name?.ilike);
        rows = sortRows(rows, orderBy);
        const normalizedOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;
        const pagedRows = withConnectionWindow(rows, first, offset);
        return connection(pagedRows, {
          hasNextPage: normalizedOffset + pagedRows.length < rows.length,
          hasPreviousPage: normalizedOffset > 0,
          cursorOffset: normalizedOffset,
        });
      },
      userId: currentUserId,
      variables: {
        filter,
        first,
        offset,
        orderBy,
      },
    });
  }

  @resolver('workflowExecutionOptions', GraphQLOperationType.QUERY)
  async workflowExecutionOptions({ input }: { input?: { organizationId?: string | null } }, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return listWorkflowExecutionOptions({
      organizationId: normalizeNullableId(input?.organizationId),
      effectiveRoot,
      requestContext: {
        request: context.request,
        supabase: context.supabase,
        userId,
      },
    });
  }

  @resolver('chatEffectiveWorkflowBinding', GraphQLOperationType.QUERY)
  async chatEffectiveWorkflowBinding(
    { input }: { input?: { organizationId?: string | null; scopeId?: string | null; scopeType?: string | null } },
    context: GraphqlResolverContext,
  ) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    const scopeId = normalizeNullableId(input?.scopeId);
    if (!scopeId) {
      throw new BadRequestError('scopeId is required.');
    }

    const organizationId = normalizeNullableId(input?.organizationId);
    const scope = {
      type: chatWorkflowScope(input?.scopeType),
      id: scopeId,
      organizationId,
    };
    const binding = await resolveChatWorkflow(context.supabase, userId, scope);
    if (!binding) {
      return null;
    }

    const permissions = buildPermissionContext(await readUserMatrixState(context.supabase, { organizationId, userId }), effectiveRoot);
    const readOnly = binding.source === 'organizationDefault' || binding.source === 'globalDefault';
    const canRead = permissions.CAN_READ_WORKFLOW;
    const canEdit = canRead && permissions.CAN_UPDATE_WORKFLOW && !readOnly;

    return {
      source: binding.source,
      workflowId: binding.workflowId,
      assignmentId: binding.assignmentId,
      readOnly,
      canRead,
      canEdit,
    };
  }

  @resolver('ai_workflow_assignmentsCollection', GraphQLOperationType.QUERY)
  async aiWorkflowAssignmentsCollection({ first, offset, orderBy, filter }: WorkflowCollectionQueryArgs = {}, context: GraphqlResolverContext) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    const actorContext = organizationAccessContext(context);

    let rows = filterWorkflowAssignmentRows(
      (await WorkflowAssignmentEntity.find().many()) as unknown as Array<Record<string, unknown>>,
      filter,
    ) as unknown as WorkflowCollectionObject[];
    if (!effectiveRoot) {
      rows = rows.filter((row) => {
        const userId = normalizeNullableId((row as any)?.user_id);
        const organizationId = normalizeNullableId((row as any)?.organization_id);
        const scopeType = normalizeNullableId((row as any)?.scope_type);
        const scopeId = normalizeNullableId((row as any)?.scope_id);

        if (userId && userId !== currentUserId) return false;
        if (!organizationId) return true;
        if (!actorContext) return false;
        if (!actorContext.organizationIds.includes(organizationId)) return false;
        if (isRestrictedScope(actorContext, scopeType, scopeId)) return false;
        return true;
      });
    }

    rows = sortRows(rows, orderBy);
    const normalizedOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;
    const pagedRows = withConnectionWindow(rows, first, offset);
    return connection(pagedRows, {
      hasNextPage: normalizedOffset + pagedRows.length < rows.length,
      hasPreviousPage: normalizedOffset > 0,
      cursorOffset: normalizedOffset,
    });
  }

  @resolver('insertIntoai_workflowsCollection', GraphQLOperationType.MUTATION)
  async insertIntoAiWorkflowsCollection({ objects }: WorkflowInsertArgs, context: GraphqlResolverContext) {
    const { userId: currentUserId } = await getResolverAuthContext(context);
    const records: WorkflowCollectionObject[] = [];
    for (const object of objects || []) {
      const input = (object || {}) as Record<string, unknown>;
      const row = await WorkflowEntity.createCollectionData({
        id: normalizeNullableId(input.id),
        name: String(input.name || 'New Workflow'),
        description: String(input.description || ''),
        searchText: workflowCatalogString(input.search_text) || null,
        webhookSecret: workflowCatalogString(input.webhook_secret) || null,
        userId: currentUserId,
        organizationId: normalizeNullableId(input.organization_id),
        isGlobal: input.is_global === true,
        isActive: input.is_active !== false,
        status: workflowCatalogString(input.status) || null,
        workflow: (input.workflow || {}) as Record<string, unknown>,
        publishedWorkflow: (input.published_workflow || {}) as Record<string, unknown>,
        metadata: (input.metadata || {}) as Record<string, unknown>,
        createdAt: workflowCatalogString(input.created_at) || null,
        updatedAt: workflowCatalogString(input.updated_at) || null,
        publishedAt: workflowCatalogString(input.published_at) || null,
      });
      records.push(row as unknown as WorkflowCollectionObject);
    }
    const result = { affectedCount: records.length, records };
    for (const row of result.records) {
      invalidateWorkflowGraphqlCache({
        workflowId: row.id,
        organizationId: row.organization_id ?? null,
      });
    }
    return result;
  }

  @resolver('updateai_workflowsCollection', GraphQLOperationType.MUTATION)
  async updateAiWorkflowsCollection({ filter, set }: WorkflowUpdateArgs = {}, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const id = String(filter?.id?.eq || '').trim();
    if (!id) return { affectedCount: 0, records: [] as WorkflowCollectionObject[] };
    const row = await WorkflowEntity.updateCollectionData({
      id,
      ...(set || {}),
    } as Record<string, unknown> as Parameters<typeof WorkflowEntity.updateCollectionData>[0]);
    const result = { affectedCount: 1, records: [row as unknown as WorkflowCollectionObject] };
    for (const row of result.records) {
      invalidateWorkflowGraphqlCache({
        workflowId: row.id,
        organizationId: row.organization_id ?? null,
      });
    }
    return result;
  }

  @resolver('insertIntoai_workflow_assignmentsCollection', GraphQLOperationType.MUTATION)
  async insertIntoAiWorkflowAssignmentsCollection({ objects }: WorkflowInsertArgs = {}, context: GraphqlResolverContext) {
    const { userId: currentUserId } = await getResolverAuthContext(context);
    const records: WorkflowCollectionObject[] = [];
    for (const object of objects || []) {
      const input = (object || {}) as Record<string, unknown>;
      const scopeType = requireWorkflowScopeType(workflowCatalogString(input.scope_type));
      const row = await WorkflowAssignmentEntity.createCollectionData({
        id: normalizeNullableId(input.id),
        workflow_id: String(input.workflow_id || ''),
        scope_type: scopeType,
        scope_id: normalizeNullableId(input.scope_id),
        user_id: normalizeNullableId(input.user_id) || currentUserId,
        organization_id: normalizeNullableId(input.organization_id),
        metadata: (input.metadata || {}) as Record<string, unknown>,
      });
      records.push(row as unknown as WorkflowCollectionObject);
    }
    return { affectedCount: records.length, records };
  }

  @resolver('updateai_workflow_assignmentsCollection', GraphQLOperationType.MUTATION)
  async updateAiWorkflowAssignmentsCollection({ filter, set }: WorkflowUpdateArgs = {}, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const id = String(filter?.id?.eq || '').trim();
    if (!id) return { affectedCount: 0, records: [] as WorkflowCollectionObject[] };
    const scopeType = (set as Record<string, unknown> | undefined)?.scope_type;
    const row = await WorkflowAssignmentEntity.updateCollectionData({
      id,
      scope_type: scopeType === undefined ? undefined : requireWorkflowScopeType(workflowCatalogString(scopeType)),
      scope_id: normalizeNullableId((set as Record<string, unknown> | undefined)?.scope_id),
      user_id: normalizeNullableId((set as Record<string, unknown> | undefined)?.user_id),
      organization_id: normalizeNullableId((set as Record<string, unknown> | undefined)?.organization_id),
      metadata: (((set as Record<string, unknown> | undefined)?.metadata || {}) as Record<string, unknown>) || {},
    });
    return { affectedCount: 1, records: [row as unknown as WorkflowCollectionObject] };
  }

  @resolver('deleteFromai_workflow_assignmentsCollection', GraphQLOperationType.MUTATION)
  async deleteFromAiWorkflowAssignmentsCollection({ filter }: WorkflowDeleteArgs = {}, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const id = String(filter?.id?.eq || '').trim();
    if (!id) return { affectedCount: 0, records: [] as WorkflowCollectionObject[] };
    await WorkflowAssignmentEntity.deleteCollectionData({ id });
    return { affectedCount: 1, records: [] as WorkflowCollectionObject[] };
  }

  @resolver('workflowExecutions', GraphQLOperationType.QUERY)
  async workflowExecutions(
    { workflowId, scope, filter, limit, offset, organizationId }: WorkflowExecutionsArgs = {},
    context: GraphqlResolverContext,
  ) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    const normalizedOrganizationId = organizationId ?? null;
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'workflowExecutions',
      read: () =>
        WorkflowExecutionEntity.listForWorkflow({
          workflowId: workflowId as string,
          first: limit ?? 50,
          offset: offset ?? 0,
        }),
      userId: currentUserId,
      variables: {
        filter: filter || null,
        limit: limit ?? null,
        organizationId: normalizedOrganizationId,
        offset: offset ?? null,
        scope,
        workflowId: workflowId ?? '',
      },
    });
  }

  @resolver('workflowVersions', GraphQLOperationType.QUERY)
  async workflowVersions({ workflowId, scope, organizationId }: WorkflowVersionsArgs = {}, context: GraphqlResolverContext) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    const normalizedOrganizationId = organizationId ?? null;
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'workflowVersions',
      read: () => WorkflowVersionEntity.listForWorkflow({ workflowId: workflowId as string, first: 50, offset: 0 }),
      userId: currentUserId,
      variables: {
        organizationId: normalizedOrganizationId,
        scope,
        workflowId: workflowId ?? '',
      },
    });
  }

  @resolver('workflowRunningStatuses', GraphQLOperationType.QUERY)
  async workflowRunningStatuses({ workflowIds, organizationId }: WorkflowRunningStatusesArgs = {}, context: GraphqlResolverContext) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    const normalizedOrganizationId = organizationId ?? null;
    const normalizedWorkflowIds = Array.isArray(workflowIds) ? workflowIds : (workflowIds as unknown as string[]);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'workflowRunningStatuses',
      read: async () => {
        const rows = await Promise.all(
          normalizedWorkflowIds.map((workflowId) => WorkflowExecutionEntity.runningStatuses({ workflowIds: [workflowId] })),
        );
        return rows.flat();
      },
      userId: currentUserId,
      variables: {
        organizationId: normalizedOrganizationId,
        scope: normalizedOrganizationId ? 'organization' : 'user',
        workflowIds: normalizedWorkflowIds,
      },
    });
  }

  @resolver('workflowUserNodes', GraphQLOperationType.QUERY)
  async workflowUserNodes({ includeInactive, organizationId, scopeType }: WorkflowUserNodesArgs = {}, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return listUserWorkflowNodes({
      currentUserId: userId,
      effectiveRoot,
      includeInactive: includeInactive === true,
      organizationId: organizationId || null,
      scopeType: scopeType || null,
      supabase: context.supabase,
      context,
    });
  }

  @resolver('workflowUserNode', GraphQLOperationType.QUERY)
  async workflowUserNode({ id }: WorkflowUserNodeArgs = {}, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    if (!id) throw new BadRequestError('workflowUserNode.id is required.');
    return getUserWorkflowNodeById({ currentUserId: userId, effectiveRoot, id, includeInactive: true, supabase: context.supabase, context });
  }

  @resolver('workflowDeleteVersions', GraphQLOperationType.MUTATION)
  async workflowDeleteVersions({ versionIds }: { versionIds?: string[] }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const ids = versionIds || [];
    for (const id of ids) {
      const version = await WorkflowVersionEntity.single(id);
      if (version) await version.delete();
    }
    const result = { deleted: ids.length };
    invalidateWorkflowGraphqlCache();
    return result;
  }

  @resolver('workflowCreateUserNode', GraphQLOperationType.MUTATION)
  async workflowCreateUserNode({ input }: WorkflowUserNodeCreateArgs, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return createUserWorkflowNode({ currentUserId: userId, effectiveRoot, input: input || {}, supabase: context.supabase, context });
  }

  @resolver('workflowUpdateUserNode', GraphQLOperationType.MUTATION)
  async workflowUpdateUserNode({ id, input }: WorkflowUserNodeUpdateArgs, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    if (!id) throw new BadRequestError('workflowUpdateUserNode.id is required.');
    return updateUserWorkflowNode({ currentUserId: userId, effectiveRoot, id, input: input || {}, supabase: context.supabase, context });
  }

  @resolver('workflowDeleteUserNode', GraphQLOperationType.MUTATION)
  async workflowDeleteUserNode({ id }: { id?: string }, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    if (!id) throw new BadRequestError('workflowDeleteUserNode.id is required.');
    const deleted = await deleteUserWorkflowNode({ currentUserId: userId, effectiveRoot, id, supabase: context.supabase, context });
    return { id, deleted };
  }

  @resolver('workflowValidateUserNode', GraphQLOperationType.MUTATION)
  async workflowValidateUserNode({ input }: WorkflowUserNodeCreateArgs, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    try {
      const slug = toSafeString(input?.slug || input?.name);
      const nodeSchema = validateNodeSchema(input?.nodeSchema, slug);
      const sourceFiles = normalizeSourceFiles(input?.sourceFiles);
      const report = reviewWorkflowNodePackageRules({ nodeSchema, sourceFiles });
      return {
        ok: report.ok,
        errors: report.errors.map((entry) => (entry.fileName ? `${entry.fileName}: ${entry.message}` : entry.message)),
        warnings: report.warnings.map((entry) => (entry.fileName ? `${entry.fileName}: ${entry.message}` : entry.message)),
        files: Object.keys(sourceFiles).sort(),
      };
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Workflow user node validation failed.'], warnings: [], files: [] };
    }
  }

  @resolver('workflowValidateNodePackage', GraphQLOperationType.MUTATION)
  async workflowValidateNodePackage({ input }: WorkflowNodePackageArgs, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    if (!input?.packageBase64) throw new BadRequestError('workflowValidateNodePackage.input.packageBase64 is required.');
    return {
      packageBase64: toSafeString(input.packageBase64),
      ...(await validateWorkflowNodePackage(toSafeString(input.packageBase64), toSafeString(input.fileName))),
    };
  }

  @resolver('workflowImportNodePackage', GraphQLOperationType.MUTATION)
  async workflowImportNodePackage({ input }: WorkflowNodePackageArgs, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return importWorkflowNodePackage({ currentUserId: userId, effectiveRoot, input: input || {}, supabase: context.supabase, context });
  }

  @resolver('workflowExportNodePackage', GraphQLOperationType.MUTATION)
  async workflowExportNodePackage({ id }: WorkflowNodePackageExportArgs, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    if (!id) throw new BadRequestError('workflowExportNodePackage.id is required.');
    return exportWorkflowNodePackage({ currentUserId: userId, effectiveRoot, id, supabase: context.supabase, context });
  }

  @resolver('withAI', GraphQLOperationType.MUTATION)
  async withAI({ input }: WithAIArgs, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    const prompt = String(input?.prompt || '').trim();
    if (!prompt) {
      throw new BadRequestError('prompt is required');
    }

    const model = EnvLoader.get('OPENAI_MODEL') || 'gpt-4.1-mini';
    const response = await openai.responses.create({
      model,
      temperature: 0.1,
      instructions: 'Return strict JSON only. Do not include markdown fences.',
      input: prompt,
    });

    const outputText = stripCodeFences(String(('output_text' in response ? response.output_text : '') || ''));
    const parsed = safeParseJson(outputText);
    await UsageEventEntity.recordPolicyUsage({
      target: 'workflow.with-ai',
      userId,
    });
    return {
      output: parsed || {
        reply: outputText || 'Action complete.',
        actions: [],
      },
    };
  }

  @resolver('workflowExecute', GraphQLOperationType.MUTATION)
  async workflowExecute({ input }: WorkflowExecutionArgs, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    const organizationId = readWorkflowOrganizationId((input.workflow || {}) as unknown as WorkflowDefinition);
    await assertBillingExecutionAccess(context.supabase, {
      userId,
      effectiveRoot,
      organizationId,
    });
    const mode = input.mode === WorkflowExecutionModeEnum.Async ? WorkflowExecutionModeEnum.Async : WorkflowExecutionModeEnum.Wait;
    const runtimeLimits = await PlanPolicyEntity.workflowRuntimeLimits({
      effectiveRoot,
      organizationId,
      userId,
      context: { supabase: context.supabase },
    });

    const authMode =
      input.settings?.authMode === 'manual'
        ? WorkflowAuthModeEnum.Manual
        : input.settings?.authMode === 'none'
        ? WorkflowAuthModeEnum.None
        : WorkflowAuthModeEnum.AutoFromCurrentSession;

    const baseSettings = {
      graphqlUrl: String(input.settings?.graphqlUrl || '').trim(),
      httpBaseUrl: input.settings?.httpBaseUrl || undefined,
      authMode,
      manualHeaders: input.settings?.manualHeaders || {},
      maxConcurrentExecutionsPerUser: runtimeLimits.maxConcurrentExecutionsPerUser,
      maxExecutionSeconds: Math.min(
        Number(input.settings?.maxExecutionSeconds) || runtimeLimits.maxExecutionSeconds,
        runtimeLimits.maxExecutionSeconds,
      ),
    };
    const requestContext = {
      request: context.request,
      supabase: context.supabase,
      userId,
    };
    const organization = organizationId ? (OrganisationEntity.load(organizationId) as OrganisationEntity) : null;
    const sharedDrive = organization
      ? await organization.sharedSpace.workflowDrive({
          request: requestContext.request,
          supabase: requestContext.supabase,
          userId: requestContext.userId,
          effectiveRoot,
        })
      : null;
    const settings = { ...baseSettings, sharedDrive } as WorkflowRuntimeSettings;
    const result = await executeWorkflowMutation({
      input: {
        workflow: (input.workflow || {}) as unknown as WorkflowDefinition,
        settings,
        mode,
        request_id: input.request_id || null,
        broadcast_id: input.broadcast_id || null,
        broadcast_channel_name: input.broadcast_channel_name || null,
      },
      requestContext,
    });
    await UsageEventEntity.recordPolicyUsage({
      target: 'workflow.execute',
      metadata: {
        mode,
      },
      organizationId,
      userId,
    });
    return result;
  }
}
