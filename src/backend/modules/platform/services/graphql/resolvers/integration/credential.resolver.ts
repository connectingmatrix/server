import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { Service } from 'typedi';
import { invalidateGraphqlCache, runNamedGraphqlCache } from '@giga/shared/cache';
import {
  activateCredential,
  assertCredentialMutationAllowed,
  assertCredentialQueryAllowed,
  createCredential,
  deleteCredential,
  getCredential,
  getCredentialCatalogPayload,
  listCredentials,
  resolveCredentialAccess,
  updateCredential,
} from '@giga/general/services/credentials';
import { getResolverAuthContext, GraphqlCustomResolverModule } from './base';
import type { GraphqlResolverContext } from '@giga/shared/types';
import type { CreateCredentialInput, CredentialQueryInput, UpdateCredentialInput } from '@giga/general/services/credentials/contracts/types';

async function resolveCredentialResolverAccess(context: GraphqlResolverContext, input: CredentialQueryInput) {
  const { userId, effectiveRoot } = await getResolverAuthContext(context);
  return resolveCredentialAccess({
    context,
    currentUserId: userId,
    effectiveRoot,
    scope: input.scope,
    organizationId: input.organizationId || null,
  });
}

@Service()
export class CredentialResolver extends GraphqlCustomResolverModule {
  @resolver('credentialCatalog', GraphQLOperationType.QUERY)
  async credentialCatalog(_payload: unknown, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'credentialCatalog',
      read: () => Promise.resolve(getCredentialCatalogPayload()),
      userId,
    });
  }

  @resolver('credentials', GraphQLOperationType.QUERY)
  async credentials({ input }: { input: CredentialQueryInput }, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'credentials',
      read: async () => {
        const access = await resolveCredentialResolverAccess(context, input);
        assertCredentialQueryAllowed(access);
        return listCredentials(context.supabase, input, access);
      },
      userId,
      variables: { input },
    });
  }

  @resolver('credential', GraphQLOperationType.QUERY)
  async credential({ id }: { id: string }, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'credential',
      read: () =>
        getCredential(context.supabase, id, async (scopeInput) => {
          const access = await resolveCredentialResolverAccess(context, scopeInput);
          assertCredentialQueryAllowed(access);
          return access;
        }),
      userId,
      variables: { id },
    });
  }

  @resolver('createCredential', GraphQLOperationType.MUTATION)
  async createCredential({ input }: { input: CreateCredentialInput }, context: GraphqlResolverContext) {
    const access = await resolveCredentialResolverAccess(context, { scope: input.scope, organizationId: input.organizationId || null });
    assertCredentialMutationAllowed(access, 'create');
    const result = await createCredential(context.supabase, input, access);
    invalidateGraphqlCache(['credentials:']);
    return result;
  }

  @resolver('updateCredential', GraphQLOperationType.MUTATION)
  async updateCredential({ input }: { input: UpdateCredentialInput }, context: GraphqlResolverContext) {
    const result = await updateCredential(context.supabase, input, async (scopeInput) => {
      const access = await resolveCredentialResolverAccess(context, scopeInput);
      assertCredentialMutationAllowed(access, 'update');
      return access;
    });
    invalidateGraphqlCache(['credentials:']);
    return result;
  }

  @resolver('deleteCredential', GraphQLOperationType.MUTATION)
  async deleteCredential({ id }: { id: string }, context: GraphqlResolverContext) {
    await deleteCredential(context.supabase, id, async (scopeInput) => {
      const access = await resolveCredentialResolverAccess(context, scopeInput);
      assertCredentialMutationAllowed(access, 'delete');
      return access;
    });
    invalidateGraphqlCache(['credentials:']);
    return { ok: true };
  }

  @resolver('activateCredential', GraphQLOperationType.MUTATION)
  async activateCredential({ id }: { id: string }, context: GraphqlResolverContext) {
    const result = await activateCredential(context.supabase, id, async (scopeInput) => {
      const access = await resolveCredentialResolverAccess(context, scopeInput);
      assertCredentialMutationAllowed(access, 'activate');
      return access;
    });
    invalidateGraphqlCache(['credentials:']);
    return result;
  }
}
