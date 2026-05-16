import type { SweepFixture } from './live-query-sweep.fixture';

export function mutationVariables(name: string, values: Record<string, unknown>, fixture: SweepFixture) {
  const suffix = fixture.channelId.slice(0, 8);
  if (name === 'authSignup') {
    return { input: { email: 'not-an-email', password: 'invalid', firstName: 'Graphql', lastName: 'E2E', username: `gql-e2e-${suffix}` } };
  }
  if (name === 'authLogin') return { input: { email: `graphql-e2e-${suffix}@example.invalid`, password: 'invalid-password' } };
  if (name === 'authRefreshToken') return { input: { access_token: 'invalid-token' } };
  if (name === 'authForgotPassword') return { input: { email: 'not-an-email', redirectTo: 'https://example.invalid/reset' } };
  if (name === 'authResetPassword') return { input: { password: 'invalid-password' } };
  if (name === 'authChangePassword') return { input: { currentPassword: 'invalid-password', newPassword: 'invalid-password-2' } };
  if (name === 'authVerifyEmail') return { input: { token: 'invalid-token', email: 'not-an-email', type: 'signup' } };
  if (name === 'authResendVerification') return { input: { email: 'not-an-email' } };
  if (name === 'authSendEmailOtp') return { input: { email: 'not-an-email' } };
  if (name === 'authVerifyOtp') return { input: { token: 'invalid-token', email: 'not-an-email', type: 'email' } };
  if ('id' in values) return { ...values, id: fixture.postId };
  if ('versionIds' in values) return { ...values, versionIds: [fixture.postId] };
  return values;
}

export function mutationErrorText(payload: { errors?: Array<{ message?: string }> }) {
  return (payload.errors || []).map((error) => error.message || '').join('\n');
}
