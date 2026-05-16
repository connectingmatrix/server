import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { liveMcpUserId } from './mcp-live.constants';

export async function resolveLiveMcpCredentialId() {
  const admin = SupabaseClientAdmin();
  const { data, error } = await admin
    .from('ai_credentials')
    .select('id')
    .eq('service_id', 'mcp')
    .eq('user_id', liveMcpUserId)
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) throw new Error(`Could not resolve a live MCP credential for ${liveMcpUserId}. ${error?.message || ''}`.trim());
  return String(data.id);
}
