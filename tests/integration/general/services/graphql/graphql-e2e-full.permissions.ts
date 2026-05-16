import { randomUUID } from 'node:crypto';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';

type PermissionModule = 'CATEGORY' | 'SUBJECT' | 'POST';
type PermissionScope = 'ORGANIZATION' | 'ORGANIZATION_MEMBER';
type PermissionRow = {
  id?: string | null;
  scope: PermissionScope;
  organization_id: string | null;
  user_id: string | null;
  module: PermissionModule;
  can_create: boolean | null;
  can_read: boolean | null;
  can_update: boolean | null;
  can_delete: boolean | null;
  can_execute: boolean | null;
};

type PermissionSnapshot = { current: PermissionRow; previous: PermissionRow | null };

const admin = () => SupabaseClientAdmin();
const modules: PermissionModule[] = ['CATEGORY', 'SUBJECT', 'POST'];

async function upsertPermission(input: PermissionRow): Promise<PermissionSnapshot> {
  let query = admin()
    .from('ai_permissions')
    .select('*')
    .eq('scope', input.scope)
    .eq('organization_id', input.organization_id)
    .eq('module', input.module);
  query = input.user_id ? query.eq('user_id', input.user_id) : query.is('user_id', null);
  const existing = await query.maybeSingle();
  if (existing.error) throw existing.error;
  const previous = (existing.data || null) as PermissionRow | null;
  const payload = { ...input, id: previous?.id || randomUUID(), updated_at: new Date().toISOString() };
  const row = previous?.id
    ? await admin().from('ai_permissions').update(payload).eq('id', previous.id).select('*').single()
    : await admin()
        .from('ai_permissions')
        .insert({ ...payload, created_at: payload.updated_at })
        .select('*')
        .single();
  if (row.error) throw row.error;
  return { current: row.data as PermissionRow, previous: previous as PermissionRow | null };
}

export async function grantTemporaryOrgMemberTreePermissions(organizationId: string, userId: string): Promise<PermissionSnapshot[]> {
  const snapshots: PermissionSnapshot[] = [];
  for (const module of modules) {
    snapshots.push(
      await upsertPermission({
        scope: 'ORGANIZATION',
        organization_id: organizationId,
        user_id: null,
        module,
        can_create: true,
        can_read: true,
        can_update: true,
        can_delete: true,
        can_execute: false,
      }),
    );
    snapshots.push(
      await upsertPermission({
        scope: 'ORGANIZATION_MEMBER',
        organization_id: organizationId,
        user_id: userId,
        module,
        can_create: true,
        can_read: true,
        can_update: true,
        can_delete: false,
        can_execute: false,
      }),
    );
  }
  return snapshots;
}

export async function restoreTemporaryPermissions(snapshots: PermissionSnapshot[]) {
  for (const snapshot of snapshots.reverse()) {
    if (snapshot.previous?.id) {
      const restored = await admin().from('ai_permissions').update(snapshot.previous).eq('id', snapshot.previous.id);
      if (restored.error) throw restored.error;
      continue;
    }
    const removed = await admin().from('ai_permissions').delete().eq('id', snapshot.current.id);
    if (removed.error) throw removed.error;
  }
}
