import { randomUUID } from 'node:crypto';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { createUserSessionHeader, graphqlRequest } from './activity-log-live.runtime.fixture';

export type RoleKey = 'root' | 'orgAdmin' | 'normal';
export type RoleSession = { email: string; organizationIds: string[]; token: string; userId: string; username: string };
export type RawGraphql = { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
type OrgMemberRow = { id?: string | null; [key: string]: unknown };

export const ROLE_EMAILS: Record<RoleKey, string> = {
  root: 'abeersaqib@gmail.com',
  orgAdmin: 'rich@gigaintelligence.com',
  normal: 'rich+123@gigaintelligence.com',
};

const admin = () => SupabaseClientAdmin();

export async function resolveRole(email: string): Promise<RoleSession> {
  const user = await admin().from('User').select('id,email,username').eq('email', email).maybeSingle();
  if (user.error || !user.data?.id || !user.data.email) throw new Error(`Could not resolve ${email}`);
  const memberships = await admin().from('organization_members').select('organization_id').eq('user_id', user.data.id).eq('is_disabled', false);
  if (memberships.error) throw memberships.error;
  const organizationIds = (memberships.data || []).map((row) => String(row.organization_id || '')).filter(Boolean);
  return {
    email: String(user.data.email),
    organizationIds,
    token: await createUserSessionHeader(String(user.data.id), String(user.data.email), { fastAppToken: true }),
    userId: String(user.data.id),
    username: String(user.data.username || ''),
  };
}

export async function readRoles() {
  return {
    root: await resolveRole(ROLE_EMAILS.root),
    orgAdmin: await resolveRole(ROLE_EMAILS.orgAdmin),
    normal: await resolveRole(ROLE_EMAILS.normal),
  };
}

export async function requestGraphql(url: string, token: string | null, query: string, variables: Record<string, unknown>): Promise<RawGraphql> {
  const response = await fetch(url, {
    body: JSON.stringify({ query, variables }),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    method: 'POST',
  });
  return (await response.json().catch(() => ({}))) as RawGraphql;
}

export async function expectGraphqlError(input: {
  pattern: RegExp;
  query: string;
  token: string | null;
  url: string;
  variables: Record<string, unknown>;
}) {
  const payload = await requestGraphql(input.url, input.token, input.query, input.variables);
  const message = (payload.errors || []).map((error) => error.message || '').join('\n');
  if (!input.pattern.test(message)) throw new Error(`Expected GraphQL error ${input.pattern}, received: ${message || JSON.stringify(payload)}`);
}

export async function grantTemporaryOrgMember(organizationId: string, userId: string) {
  const existing = await admin().from('organization_members').select('*').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle();
  if (existing.error) throw existing.error;
  const payload = { is_disabled: false, metadata: { source: 'graphql-e2e-full' }, organization_id: organizationId, role: 'MEMBER', user_id: userId };
  const row = existing.data?.id
    ? await admin().from('organization_members').update(payload).eq('id', existing.data.id).select('*').single()
    : await admin()
        .from('organization_members')
        .insert({ ...payload, id: randomUUID() })
        .select('*')
        .single();
  if (row.error) throw row.error;
  return { current: row.data as OrgMemberRow, previous: (existing.data || null) as OrgMemberRow | null };
}

export async function restoreTemporaryOrgMember(snapshot: { current: OrgMemberRow; previous: OrgMemberRow | null } | null) {
  if (!snapshot?.current?.id) return;
  if (snapshot.previous?.id) {
    const restored = await admin().from('organization_members').update(snapshot.previous).eq('id', snapshot.previous.id);
    if (restored.error) throw restored.error;
    return;
  }
  const removed = await admin().from('organization_members').delete().eq('id', snapshot.current.id);
  if (removed.error) throw removed.error;
}

export const gql = graphqlRequest;
