import { BadRequestError } from 'routing-controllers';
import { OrganisationEntity } from '@connectingmatrix/orm/repositories/entities/runtime/OrganisationEntity';
import { OrganizationMemberEntity } from '@connectingmatrix/orm/repositories/entities/runtime/OrganizationMemberEntity';
import type { SupabaseClient } from '@supabase/supabase-js';

type OrganizationRow = {
  id: string;
  created_by?: string | null;
  is_active?: boolean | null;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role?: string | null;
  is_disabled?: boolean | null;
};

export type OrganizationOwnerState = {
  organization: OrganizationRow;
  members: MembershipRow[];
  ownerMember: MembershipRow;
  ownerUserId: string;
};

export async function readOwnedOrganizationIds(_adminSupabase: SupabaseClient, userId: string, memberships: MembershipRow[]) {
  const superAdminIds = memberships.filter((row) => row.role === 'SUPER_ADMIN').map((row) => row.organization_id);
  if (!superAdminIds.length) return [];
  const rows = await OrganisationEntity.listOwnedRowsByCreatorId(userId);
  return rows
    .filter((row) => superAdminIds.includes(String(row.id || '')))
    .filter((row) => row.isActive !== false)
    .map((row) => String(row.id || ''))
    .filter(Boolean);
}

export async function readOrganizationOwnerState(_adminSupabase: SupabaseClient, organizationId: string): Promise<OrganizationOwnerState> {
  const organization = await OrganisationEntity.findById(organizationId);
  if (!organization?.id) throw new BadRequestError('Organization not found.');
  const members = (await OrganizationMemberEntity.findByOrganizationId(organizationId)) as MembershipRow[];
  const ownerUserId = String(organization.createdBy || '').trim();
  const activeOwners = members.filter((row) => row.is_disabled !== true && row.role === 'SUPER_ADMIN');
  const ownerMember = activeOwners.find((row) => row.user_id === ownerUserId);
  if (!ownerUserId || !ownerMember || activeOwners.length !== 1) {
    throw new BadRequestError('Organization owner invariant is invalid.');
  }
  return {
    organization: { id: String(organization.id || ''), created_by: organization.createdBy, is_active: organization.isActive },
    members,
    ownerMember,
    ownerUserId,
  };
}

export async function requireOrganizationOwner(adminSupabase: SupabaseClient, organizationId: string, userId: string) {
  const owner = await readOrganizationOwnerState(adminSupabase, organizationId);
  if (owner.ownerUserId !== userId) {
    throw new BadRequestError('Only the organization owner can manage organization billing.');
  }
  return owner;
}

export async function transferOrganizationOwner(adminSupabase: SupabaseClient, organizationId: string, userId: string, now: string) {
  await OrganizationMemberEntity.demoteSuperAdminsExceptUser({ organizationId, userId });
  const promotion = await OrganizationMemberEntity.updateByOrganizationAndUser({
    organizationId,
    userId,
    patch: {
      role: 'SUPER_ADMIN',
      is_disabled: false,
      updated_at: now,
    },
  });
  if (!promotion?.id) throw new BadRequestError('Organization owner member was not found.');
  await OrganisationEntity.updateById(organizationId, { createdBy: userId, updatedAt: now });
}
