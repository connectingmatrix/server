import { invariant } from '@giga/shared/lib/helper';
import { GraphEntity } from '@connectingmatrix/orm/repositories/GraphEntity';
import { AttachUserPermissionsInput, GRAPH_RESOURCE_LABEL_BY_TYPE, GraphEntityTypeToken } from '@giga/shared/types/contracts/graph.types';

function resolveResourceLabel(input: AttachUserPermissionsInput): GraphEntityTypeToken {
  const label = GRAPH_RESOURCE_LABEL_BY_TYPE[input.resourceType];
  invariant(Boolean(label), `Unsupported resource type ${input.resourceType} in attachUserPermissions`);
  return label;
}

export async function attachUserPermissions(input: AttachUserPermissionsInput): Promise<{
  userPermissionsId: string;
  resourceId: string;
  grantType: string;
}> {
  const resource = new GraphEntity({
    type: resolveResourceLabel(input),
    data: {
      id: input.resourceId,
    },
  });

  const payload = await resource.attachUserPermissions({
    userPermissionsId: input.userPermissionsId,
    userPermissionsType: input.userPermissionsType,
    userPermissionsDisplayName: input.userPermissionsDisplayName ?? undefined,
    userPermissionsSlug: input.userPermissionsSlug ?? undefined,
    grantType: input.grantType,
    permissions: input.permissions,
    permissionProfile: input.permissionProfile ?? null,
  });

  return {
    userPermissionsId: payload.userPermissionsId,
    resourceId: payload.resourceId,
    grantType: payload.grantType,
  };
}
