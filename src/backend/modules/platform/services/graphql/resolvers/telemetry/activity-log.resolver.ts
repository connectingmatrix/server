import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { GraphqlResolverContext } from '@giga/shared/types';
import { BadRequestError } from 'routing-controllers';
import { Service } from 'typedi';
import { UserActivityLogEntity } from '@connectingmatrix/orm/repositories/entities';
import { GraphqlCustomResolverModule, getResolverAuthContext } from '../integration/base';

@Service()
export class ActivityLogResolver extends GraphqlCustomResolverModule {
  @resolver('userActivityLogs', GraphQLOperationType.QUERY)
  async userActivityLogs(
    { input }: { input: { userId: string; organizationId?: string | null; limit?: number | null; offset?: number | null } },
    context: GraphqlResolverContext,
  ) {
    const auth = await getResolverAuthContext(context);
    if (!auth.effectiveRoot && auth.userId !== input.userId) {
      throw new BadRequestError('You can only view your own activity logs.');
    }

    const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.min(Math.max(Math.floor(input.limit), 1), 200) : 20;
    const offset = typeof input.offset === 'number' && Number.isFinite(input.offset) ? Math.max(Math.floor(input.offset), 0) : 0;
    let query = UserActivityLogEntity.find({ user_id: input.userId });
    if (input.organizationId) query = query.where({ organization_id: input.organizationId });
    const result = await query.orderBy('created_at', 'desc').limit(limit).offset(offset).manyWithCount();

    return {
      data: result.records.map((row) => row.extract()),
      count: result.count,
      limit,
      offset,
    };
  }
}
