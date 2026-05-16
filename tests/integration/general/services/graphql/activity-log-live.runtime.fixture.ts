import { ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { EnvLoader } from '@giga/shared/lib/env';
import { waitForCondition } from '@connectingmatrix/workflow-driver/services/workflow/queue/__tests__/workflow-webhook-live.runtime.fixture';
import { signAppAccessToken } from '@giga/permissions/services/auth/app-auth-token';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';

export async function isLiveApiHealthy(port: number) {
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function startLiveApi(port: number, env: Record<string, string> = {}): Promise<ChildProcess> {
  const entry = path.join(process.cwd(), 'dist', 'api.js');
  if (!fs.existsSync(entry)) {
    throw new Error('dist/api.js is missing. Run yarn build before the live activity log test.');
  }
  if (await isLiveApiHealthy(port)) return null as any;

  const keepLiveApi = process.env.CHAT_PARITY_KEEP_API === '1';
  const child = spawn('node', [entry], {
    cwd: process.cwd(),
    detached: keepLiveApi,
    env: {
      ...process.env,
      PORT: String(port),
      ...env,
    },
    stdio: keepLiveApi ? 'ignore' : 'pipe',
  });
  const output: string[] = [];
  child.stdout?.on('data', (chunk) => output.push(String(chunk || '')));
  child.stderr?.on('data', (chunk) => output.push(String(chunk || '')));
  child.on('exit', () => {
    if (!output.length) return;
    process.stderr.write(`\n[live-api-exit:${port}]\n${output.join('')}\n`);
  });

  await waitForCondition(
    async () => {
      if (await isLiveApiHealthy(port)) return true;
      if (child.exitCode != null) throw new Error(output.join('').trim() || `Live API exited before becoming healthy on port ${port}.`);
      return false;
    },
    60_000,
    500,
  );

  if (keepLiveApi) {
    child.unref();
    return null as any;
  }

  return child;
}

export async function stopLiveApi(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => {
      setTimeout(resolve, 10_000);
    }),
  ]);
}

export async function createUserSessionHeader(userId: string, email?: string | null, options: { fastAppToken?: boolean } = {}): Promise<string> {
  const admin = SupabaseClientAdmin();
  const resolvedEmail = String(email || '').trim();
  const user = resolvedEmail
    ? { error: null, data: { email: resolvedEmail } }
    : await admin.from('User').select('email').eq('id', userId).maybeSingle();
  if (user.error || !user.data?.email) {
    throw new Error(`Could not resolve user email for ${userId}. ${user.error?.message || ''}`.trim());
  }
  const userEmail = String(user.data.email).trim();
  if (options.fastAppToken) {
    return signAppAccessToken({ iat: Math.floor(Date.now() / 1000), sub: userId, user: { email: userEmail }, ver: 'giga-app-auth' });
  }
  const client = createClient(EnvLoader.getOrThrow('SUPABASE_URL'), EnvLoader.getOrThrow('SUPABASE_ANON_KEY'));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: userEmail });
    if (link.error || !link.data?.properties?.email_otp) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      throw new Error(`Could not generate a login link for ${userEmail}. ${link.error?.message || ''}`.trim());
    }
    const session = await client.auth.verifyOtp({ email: userEmail, token: link.data.properties.email_otp, type: 'magiclink' });
    const accessToken = session.data?.session?.access_token || '';
    const refreshToken = session.data?.session?.refresh_token || '';
    if (!session.error && accessToken && refreshToken) {
      const now = Math.floor(Date.now() / 1000);
      const appToken = signAppAccessToken({
        iat: now,
        sub: userId,
        supabaseAccessToken: accessToken,
        user: { email: userEmail },
        ver: 'giga-app-auth',
      });
      return appToken;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250));
    else throw new Error(`Could not create a session for ${userEmail}. ${session.error?.message || ''}`.trim());
  }
  throw new Error(`Could not create a session for ${userEmail}.`);
}

export async function graphqlRequest<T>(
  url: string,
  authorization: string,
  query: string,
  variables: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
) {
  const body = JSON.stringify({ query, variables });
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;
  const payload = await new Promise<any>((resolve, reject) => {
    const request = client.request(
      target,
      {
        method: 'POST',
        timeout: options.timeoutMs || 180_000,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${authorization}`,
          'content-length': String(Buffer.byteLength(body)),
        },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += String(chunk || '');
        });
        response.on('end', () => {
          try {
            const data = raw ? JSON.parse(raw) : null;
            if ((response.statusCode || 500) >= 400 || data?.errors?.length) reject(new Error(JSON.stringify(data)));
            else resolve(data);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('timeout', () => {
      request.destroy(new Error('Timed out waiting for GraphQL response.'));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
  return payload.data as T;
}
