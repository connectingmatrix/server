/**
 * Organization-scope resolver for graph-backed resources.
 * Plan-policy checks need one organizationId to decide which policy row and which limits apply.
 * This file loads channels, categories, and subjects from the graph tree and translates them
 * into that organizationId so resolver-manifest can attach the correct plan scope to an action.
 */
import { invariant } from '@giga/shared/lib/helper';
import { Channel } from '@connectingmatrix/orm/repositories/entities/tree/Channel';
import { Category } from '@connectingmatrix/orm/repositories/entities/tree/Category';
import { Subject } from '@connectingmatrix/orm/repositories/entities/tree/Subject';
import { readTreeScope } from '@giga/tree/services/giga/tree/shared/auth/scope';
import { RESOURCE_TYPES, type ResourceType } from '@giga/shared/types/contracts/graph.types';

async function readNodeScope(resourceType: ResourceType, resourceId: string) {
  const entity =
    resourceType === RESOURCE_TYPES.channel
      ? new Channel({ id: resourceId })
      : resourceType === RESOURCE_TYPES.category
      ? new Category({ id: resourceId })
      : new Subject({ id: resourceId, supabaseId: resourceId });
  const node = await entity.load();
  invariant(node, `${resourceType} ${resourceId} was not found in graph.`);
  return readTreeScope(node);
}

export async function readPlanOrganizationIdForResource(resourceType: ResourceType, resourceId: string) {
  return (await readNodeScope(resourceType, resourceId)).organizationId || null;
}

export async function readPlanOrganizationIdForChannel(input: { organizationId?: string | null; parentChannelId?: string | null }) {
  if (input.parentChannelId) return (await readNodeScope(RESOURCE_TYPES.channel, input.parentChannelId)).organizationId || null;
  return input.organizationId || null;
}

export async function readPlanOrganizationIdForSubject(metadata: unknown) {
  const value = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  if (value.categoryId) return (await readNodeScope(RESOURCE_TYPES.category, String(value.categoryId))).organizationId || null;
  return value.organizationId ? String(value.organizationId) : null;
}

export function readPlanOrganizationIdForPost(subjectId: string) {
  return readPlanOrganizationIdForResource(RESOURCE_TYPES.subject, subjectId);
}
