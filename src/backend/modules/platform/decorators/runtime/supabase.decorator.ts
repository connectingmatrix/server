import { createParamDecorator } from 'routing-controllers';
import { Inject, Token } from 'typedi';
import { SupabaseClient } from '@giga/general/decorators/integration/supabase-client';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import type { SupabaseClient as SupabaseClientType } from '@supabase/supabase-js';

// TypeDI token for SupabaseClient
export const SUPABASE_CLIENT_TOKEN = new Token<SupabaseClientType>('SupabaseClient');

// TypeDI token for SupabaseClientAdmin
export const SUPABASE_ADMIN_CLIENT_TOKEN = new Token<SupabaseClientType>('SupabaseClientAdmin');

// Decorator for routing-controllers (method parameters)
export function InjectSupabase() {
  return createParamDecorator({
    required: true,
    value: async (action) => SupabaseClient(action.request),
  });
}

// Decorator for routing-controllers (method parameters)
export function InjectSupabaseAdmin() {
  return createParamDecorator({
    required: true,
    value: () => SupabaseClientAdmin(),
  });
}

// Decorator for TypeDI constructor injection (services)
// This is an alias that can be used in service constructors
export function InjectSupabaseService() {
  return Inject(SUPABASE_CLIENT_TOKEN);
}

// Decorator for TypeDI constructor injection (admin services)
export function InjectSupabaseAdminService() {
  return Inject(SUPABASE_ADMIN_CLIENT_TOKEN);
}
