import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { Service } from 'typedi';
import { OrganisationEntity } from '@connectingmatrix/orm/repositories/entities';
import type { GraphqlResolverContext } from '@giga/shared/types';

type SharedSpaceInput = {
  checksum?: string | null;
  contentBase64?: string | null;
  fromPath?: string;
  json?: unknown;
  organizationId: string;
  path?: string | null;
  toPath?: string;
  url?: string;
};

const org = (organizationId: string) => OrganisationEntity.load(organizationId) as OrganisationEntity;

@Service()
export class SharedSpaceResolver {
  @resolver('organizationSharedSpace', GraphQLOperationType.QUERY)
  async organizationSharedSpace({ organizationId }: { organizationId: string }, context: GraphqlResolverContext) {
    return org(organizationId).sharedSpace.summary(context);
  }

  @resolver('organizationSharedSpaceFiles', GraphQLOperationType.QUERY)
  async organizationSharedSpaceFiles({ input }: { input: SharedSpaceInput }, context: GraphqlResolverContext) {
    return org(input.organizationId).sharedSpace.files(context, { path: input.path || '/drive' });
  }

  @resolver('organizationSharedSpaceStat', GraphQLOperationType.QUERY)
  async organizationSharedSpaceStat({ input }: { input: SharedSpaceInput }, context: GraphqlResolverContext) {
    return org(input.organizationId).sharedSpace.stat(context, { path: String(input.path || '') });
  }

  @resolver('organizationSharedSpaceCreateFolder', GraphQLOperationType.MUTATION)
  async organizationSharedSpaceCreateFolder({ input }: { input: SharedSpaceInput }, context: GraphqlResolverContext) {
    return org(input.organizationId).sharedSpace.createFolder(context, { path: String(input.path || '') });
  }

  @resolver('organizationSharedSpaceWriteFile', GraphQLOperationType.MUTATION)
  async organizationSharedSpaceWriteFile({ input }: { input: SharedSpaceInput }, context: GraphqlResolverContext) {
    return org(input.organizationId).sharedSpace.writeFile(context, {
      contentBase64: input.contentBase64 || null,
      json: input.json,
      path: String(input.path || ''),
    });
  }

  @resolver('organizationSharedSpaceDownloadUrl', GraphQLOperationType.MUTATION)
  async organizationSharedSpaceDownloadUrl({ input }: { input: SharedSpaceInput }, context: GraphqlResolverContext) {
    return org(input.organizationId).sharedSpace.downloadUrl(context, {
      checksum: input.checksum || null,
      path: String(input.path || ''),
      url: String(input.url || ''),
    });
  }

  @resolver('organizationSharedSpaceMove', GraphQLOperationType.MUTATION)
  async organizationSharedSpaceMove({ input }: { input: SharedSpaceInput }, context: GraphqlResolverContext) {
    return org(input.organizationId).sharedSpace.move(context, {
      fromPath: String(input.fromPath || ''),
      toPath: String(input.toPath || ''),
    });
  }

  @resolver('organizationSharedSpaceCopy', GraphQLOperationType.MUTATION)
  async organizationSharedSpaceCopy({ input }: { input: SharedSpaceInput }, context: GraphqlResolverContext) {
    return org(input.organizationId).sharedSpace.copy(context, {
      fromPath: String(input.fromPath || ''),
      toPath: String(input.toPath || ''),
    });
  }

  @resolver('organizationSharedSpaceDelete', GraphQLOperationType.MUTATION)
  async organizationSharedSpaceDelete({ input }: { input: SharedSpaceInput }, context: GraphqlResolverContext) {
    return org(input.organizationId).sharedSpace.deletePath(context, { path: String(input.path || '') });
  }
}
