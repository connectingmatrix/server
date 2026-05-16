import { readUserMatrixState } from '@giga/permissions/manifest/user-matrix';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';

const admin = () => SupabaseClientAdmin();

function sharedSpacePermissionPlan(permissions: Record<string, any>) {
  return {
    ...permissions,
    SHARED_SPACE: {
      create: true,
      read: true,
      update: true,
      delete: true,
      execute: true,
    },
  };
}

export async function ensureLiveSharedSpacePermission(organizationId: string, userId: string) {
  const state = await readUserMatrixState(admin(), { organizationId, userId });
  if (!state.scope || !state.planId || !state.mode) return null;
  const current = await admin()
    .from('ai_plan_policies')
    .select('*')
    .eq('plan_id', state.planId)
    .eq('mode', state.mode)
    .eq('scope', state.scope)
    .maybeSingle();
  if (current.error) throw current.error;
  const permissions = sharedSpacePermissionPlan(current.data?.permissions || {});
  const payload = { permissions, updated_at: new Date().toISOString() };
  if (current.data?.id) {
    const updated = await admin().from('ai_plan_policies').update(payload).eq('id', current.data.id).select('*').single();
    if (updated.error) throw updated.error;
    return { previous: current.data, current: updated.data };
  }
  const inserted = await admin()
    .from('ai_plan_policies')
    .insert({
      mode: state.mode,
      plan_id: state.planId,
      scope: state.scope,
      permissions,
      limitations: current.data?.limitations || {},
      node_restrictions: current.data?.node_restrictions || [],
      trial_days: current.data?.trial_days || null,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (inserted.error) throw inserted.error;
  return { previous: null, current: inserted.data };
}

export async function restoreLiveSharedSpacePermission(permission: { previous: any; current: any } | null) {
  if (!permission?.current?.id) return;
  if (permission.previous?.id) {
    const { id, ...previous } = permission.previous;
    const restored = await admin().from('ai_plan_policies').update(previous).eq('id', id).select('*').single();
    if (restored.error) throw restored.error;
    return;
  }
  const removed = await admin().from('ai_plan_policies').delete().eq('id', permission.current.id);
  if (removed.error) throw removed.error;
}
