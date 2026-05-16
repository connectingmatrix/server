import { GraphQLOperationType, getCustomResolvers } from '@connectingmatrix/graphql-parser';
import { Container } from 'typedi';
import { BadRequestError } from 'routing-controllers';
import { runResolverAccessMiddleware } from '@giga/permissions/manifest/manifest';
import { withEntityRequestContext } from '@connectingmatrix/orm/services/graphql/entity-request-context';
import type { GigaMcpContext } from './context';
import type { GraphqlProxyBody, GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

type ResolverFn = (root: unknown, payload: Record<string, unknown>, context: GraphqlResolverContext, info: unknown) => Promise<unknown> | unknown;

let mutations: Record<string, ResolverFn> | null = null;

async function resolveMutations() {
  if (!mutations) {
    const { FactoryService } = await import('@giga/general/services/graphql/factory.service');
    mutations = getCustomResolvers(Container.get(FactoryService), GraphQLOperationType.MUTATION) as Record<string, ResolverFn>;
  }
  return mutations;
}

function graphqlContext(context: GigaMcpContext, operationName: string, payload: Record<string, unknown>): GraphqlResolverContext {
  const body: GraphqlProxyBody = { operationName, query: '', variables: payload };
  return {
    ...context,
    body,
    graphqlContext: context.graphqlContext || null,
    userId: context.userId || null,
    effectiveRoot: context.effectiveRoot === true,
  };
}

export async function executeMcpToolViaGraphql(context: GigaMcpContext, name: string, args: Record<string, unknown>) {
  const operationName = 'mcpExecuteTool';
  const payload = { input: { name, args } };
  const resolver = (await resolveMutations())[operationName];
  if (!resolver) throw new BadRequestError(`GraphQL resolver "${operationName}" is not available.`);
  const gqlContext = graphqlContext(context, operationName, payload);
  return withEntityRequestContext(gqlContext, payload, async () => {
    await runResolverAccessMiddleware(operationName, gqlContext, payload);
    return resolver({}, payload, gqlContext, {});
  });
}
