import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseStub } from '@giga/shared/test/supabase-stub';
import { getUserByEmail } from '@giga/general/services/user/lookups/read/get-user-by-email';

function createUserSupabase(rows: Array<Record<string, unknown>>) {
  return createSupabaseStub({ User: rows });
}

test('getUserByEmail returns null when there is no exact email match', async () => {
  const user = await getUserByEmail(createUserSupabase([]) as any, 'nobody@example.com');
  assert.equal(user, null);
});

test('getUserByEmail throws an explicit ambiguity error for duplicate exact emails', async () => {
  await assert.rejects(
    () =>
      getUserByEmail(
        createUserSupabase([
          { id: 'user-1', email: 'dupe@example.com' },
          { id: 'user-2', email: 'dupe@example.com' },
        ]) as any,
        'dupe@example.com',
      ),
    /Multiple users share this email/i,
  );
});
