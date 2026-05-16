import { invariant } from '@giga/shared/lib/helper';
import { OrganizationEntity } from '@connectingmatrix/orm/repositories/graph-entities';
import type { OrganizationNode } from '@giga/shared/types/contracts/graph.types';

type SaveOrganizationTreeNodeInput = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  createdBy?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export async function saveOrganizationTreeNode(input: SaveOrganizationTreeNodeInput): Promise<OrganizationNode> {
  const entity = new OrganizationEntity({
    id: input.id,
    slug: input.slug,
    name: input.name,
    description: input.description || undefined,
    createdBy: input.createdBy || undefined,
    isActive: input.isActive !== false,
    createdAt: input.createdAt || undefined,
    updatedAt: input.updatedAt || undefined,
  });
  await entity.commit();
  const organization = await entity.load();
  invariant(organization, `Failed to sync organization node ${input.id}.`);
  return organization as OrganizationNode;
}

export async function deleteOrganizationTreeNode(id: string): Promise<number> {
  return new OrganizationEntity({
    id,
  }).delete({
    detach: true,
  });
}
