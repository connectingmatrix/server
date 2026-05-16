/**
 * Synchronous assertion helpers for an already-built OrganizationAccessContext.
 * These functions do not fetch anything themselves; they only decide whether the
 * current access snapshot allows a module action or resource id.
 * It feeds the resolver access middleware and the imperative access bundle.
 */
import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import type { Action, OrganizationAccessContext } from '@giga/shared/types/contracts/org.types';

export function requireOrganizationPermission(accessContext: OrganizationAccessContext, input: { module: string; action: Action }) {
  if (accessContext.bypassPermissions) return;
  const permission = accessContext.modulePermissions[input.module] || {
    allowCreate: true,
    allowRead: true,
    allowUpdate: true,
    allowDelete: true,
    allowExecute: true,
  };
  const allowed =
    input.action === 'create'
      ? permission.allowCreate
      : input.action === 'read'
      ? permission.allowRead
      : input.action === 'update'
      ? permission.allowUpdate
      : input.action === 'delete'
      ? permission.allowDelete
      : permission.allowExecute;
  if (!allowed) throw new BadRequestError(`Insufficient permissions for ${input.module} ${input.action}.`);
}

export function assertOrganizationFeatureAllowed(
  accessContext: OrganizationAccessContext,
  targetType: 'CHANNEL' | 'CATEGORY' | 'SUBJECT' | 'POST',
  targetId: string,
) {
  if (accessContext.bypassPermissions) return;
  const value = toSafeString(targetId);
  if (!value) return;
  if (targetType === 'CHANNEL' && accessContext.deniedChannelIds.has(value)) throw new BadRequestError('Access denied for this channel.');
  if (targetType === 'CATEGORY' && accessContext.deniedCategoryIds.has(value)) throw new BadRequestError('Access denied for this category.');
  if (targetType === 'SUBJECT' && accessContext.deniedSubjectIds.has(value)) throw new BadRequestError('Access denied for this subject.');
  if (targetType === 'POST' && accessContext.deniedPostIds.has(value)) throw new BadRequestError('Access denied for this post.');
}

export function isNodeRestricted(accessContext: OrganizationAccessContext, nodeId: string) {
  return accessContext.deniedNodeIds.has(toSafeString(nodeId));
}
