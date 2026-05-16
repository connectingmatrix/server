import { BadRequestError } from 'routing-controllers';
import { ChannelEntity, CategoryEntity, SubjectEntity, PostEntity } from '@connectingmatrix/orm/repositories/entities';
import { getResolverAuthContext } from '../integration/base';
import type { GraphqlResolverContext } from '@giga/shared/types';

type ScopedTreeRow = {
  createdBy: string | null;
  organizationId: string | null;
};

async function assertTreeWrite(context: GraphqlResolverContext, row: ScopedTreeRow, label: string) {
  const { userId, effectiveRoot } = await getResolverAuthContext(context);
  if (effectiveRoot) return;
  if (row.organizationId && context.resolverAccess?.organizationId === row.organizationId) return;
  if (!row.organizationId && row.createdBy === userId) return;
  throw new BadRequestError(`${label} is not accessible.`);
}

export async function requireChannelWrite(context: GraphqlResolverContext, id: string) {
  if (!id) throw new BadRequestError('Channel id is required.');
  const row = await ChannelEntity.single(id);
  if (!row) throw new BadRequestError(`Channel ${id} was not found.`);
  await assertTreeWrite(context, row, 'Channel');
  return row;
}

export async function requireCategoryWrite(context: GraphqlResolverContext, id: string) {
  if (!id) throw new BadRequestError('Category id is required.');
  const row = await CategoryEntity.single(id);
  if (!row) throw new BadRequestError(`Category ${id} was not found.`);
  await assertTreeWrite(context, row, 'Category');
  return row;
}

export async function requireSubjectWrite(context: GraphqlResolverContext, id: string) {
  if (!id) throw new BadRequestError('Subject id is required.');
  const row = await SubjectEntity.single(id);
  if (!row) throw new BadRequestError(`Subject ${id} was not found.`);
  await assertTreeWrite(context, row, 'Subject');
  return row;
}

export async function requirePostWrite(context: GraphqlResolverContext, id: string) {
  if (!id) throw new BadRequestError('Post id is required.');
  const row = await PostEntity.single(id);
  if (!row) throw new BadRequestError(`Post ${id} was not found.`);
  await requireSubjectWrite(context, row.subject_id || '');
  return row;
}
