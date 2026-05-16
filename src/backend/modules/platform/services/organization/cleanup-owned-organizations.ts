import { BadRequestError } from 'routing-controllers';
import { OrganisationEntity } from '@connectingmatrix/orm/repositories/entities/runtime/OrganisationEntity';
import { OrganizationContentRestrictionEntity } from '@connectingmatrix/orm/repositories/entities/runtime/OrganizationContentRestrictionEntity';
import { OrganizationMemberEntity } from '@connectingmatrix/orm/repositories/entities/runtime/OrganizationMemberEntity';
import { OrganizationNodeRestrictionEntity } from '@connectingmatrix/orm/repositories/entities/runtime/OrganizationNodeRestrictionEntity';
import { PermissionEntity } from '@connectingmatrix/orm/repositories/entities/auth/PermissionEntity';
import { UserEntity } from '@connectingmatrix/orm/repositories/entities/runtime/UserEntity';
import { WorkflowEntity } from '@connectingmatrix/orm/repositories/entities/runtime/WorkflowEntity';
import { readOrganizationBillingMeta } from '@giga/general/services/billing/runtime/metadata';
import { readOrganizationOwnerState } from '@giga/general/services/organization/owner';

type OrganizationRow = {
  id: string;
  name: string;
  created_by?: string | null;
  billing_status?: string | null;
  metadata?: unknown;
};

export async function cleanupOwnedOrganizations(
  adminSupabase: any,
  input: {
    apply?: boolean;
    deleteTree?: (supabase: any, args: { organizationId: string; userPermissionsId: string }) => Promise<void>;
    email: string;
    keepOrganizationId: string;
  },
) {
  const user = await UserEntity.findIdEmailByEmail(input.email);
  if (!user?.id) throw new BadRequestError(`User not found for ${input.email}.`);
  const organizations = (await OrganisationEntity.listOwnedRowsByCreatorId(user.id)) as OrganizationRow[];
  const keepOrganization = organizations.find((row) => row.id === input.keepOrganizationId);
  if (!keepOrganization) throw new BadRequestError('keepOrganizationId is not owned by the target user.');
  const deleteOrganizations = organizations.filter((row) => row.id !== input.keepOrganizationId);
  const deletedOrganizationIds: string[] = [];

  for (const organization of deleteOrganizations) {
    const owner = await readOrganizationOwnerState(adminSupabase, organization.id);
    const activeMembers = owner.members.filter((row) => row.is_disabled !== true);
    if (activeMembers.some((row) => row.user_id !== owner.ownerUserId)) {
      throw new BadRequestError(`Organization ${organization.id} has active members beyond the owner.`);
    }
    const billingMeta = readOrganizationBillingMeta(organization.metadata);
    if (
      organization.billing_status === 'PAID' ||
      billingMeta.stripeCustomerId ||
      billingMeta.currentPlanId ||
      billingMeta.orgUrl ||
      billingMeta.deploymentPending
    ) {
      throw new BadRequestError(`Organization ${organization.id} has billing state and cannot be hard-deleted by this script.`);
    }
    const workflows = await WorkflowEntity.findByOrganizationId(organization.id, 'id');
    if (workflows.length) {
      throw new BadRequestError(`Organization ${organization.id} still has workflows and cannot be hard-deleted by this script.`);
    }
    if (!input.apply) continue;
    const deleteTree = input.deleteTree || (await import('@giga/general/services/giga/write/delete-organization-tree')).deleteOrganizationTree;
    await PermissionEntity.deleteByOrganizationId(organization.id);
    await OrganizationNodeRestrictionEntity.deleteByOrganizationId(organization.id);
    await OrganizationContentRestrictionEntity.deleteByOrganizationId(organization.id);
    await OrganizationMemberEntity.deleteByOrganizationId(organization.id);
    await deleteTree(adminSupabase, {
      organizationId: organization.id,
      userPermissionsId: user.id,
    });
    await OrganisationEntity.deleteById(organization.id);
    deletedOrganizationIds.push(organization.id);
  }

  return {
    email: user.email,
    keepOrganizationId: input.keepOrganizationId,
    ownedOrganizationIds: organizations.map((row) => row.id),
    deletedOrganizationIds,
    deleteOrganizationIds: deleteOrganizations.map((row) => row.id),
  };
}
