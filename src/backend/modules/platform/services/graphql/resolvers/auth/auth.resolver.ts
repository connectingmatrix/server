import { GraphQLOperationType, resolverFn } from '@connectingmatrix/graphql-parser';
import {
  authChangePasswordAction,
  authForgotPasswordAction,
  authLoginAction,
  authLogoutAction,
  authRefreshTokenAction,
  authResendVerificationAction,
  authResetPasswordAction,
  authSendEmailOtpAction,
  authSignupAction,
  authSignupOrganisationAction,
  authVerifyEmailAction,
  authVerifyOtpAction,
} from '@giga/permissions/services/auth/resolver-system';
import type {
  AuthChangePasswordArgs,
  AuthForgotPasswordArgs,
  AuthLoginArgs,
  AuthRefreshTokenArgs,
  AuthResendVerificationArgs,
  AuthResetPasswordArgs,
  AuthSendEmailOtpArgs,
  AuthSignupArgs,
  AuthSignupOrganisationArgs,
  AuthVerifyEmailArgs,
  AuthVerifyOtpArgs,
  GraphqlResolverContext,
} from '@giga/shared/types';

export const authPing = resolverFn(
  'authPing',
  GraphQLOperationType.QUERY,
)(async (_payload: Record<string, never>, _context: GraphqlResolverContext) => ({ message: 'pong' }));

export const authSignup = resolverFn(
  'authSignup',
  GraphQLOperationType.MUTATION,
)(async (args: AuthSignupArgs, context: GraphqlResolverContext) => authSignupAction(args, context));

export const authSignupOrganisation = resolverFn(
  'authSignupOrganisation',
  GraphQLOperationType.MUTATION,
)(async (args: AuthSignupOrganisationArgs, context: GraphqlResolverContext) => authSignupOrganisationAction(args, context));

export const authLogin = resolverFn(
  'authLogin',
  GraphQLOperationType.MUTATION,
)(async (args: AuthLoginArgs, context: GraphqlResolverContext) => authLoginAction(args, context));

export const authLogout = resolverFn(
  'authLogout',
  GraphQLOperationType.MUTATION,
)(async (_payload: Record<string, never>, context: GraphqlResolverContext) => authLogoutAction(context));

export const authRefreshToken = resolverFn(
  'authRefreshToken',
  GraphQLOperationType.MUTATION,
)(async (args: AuthRefreshTokenArgs = {}, context: GraphqlResolverContext) => authRefreshTokenAction(args, context));

export const authForgotPassword = resolverFn(
  'authForgotPassword',
  GraphQLOperationType.MUTATION,
)(async (args: AuthForgotPasswordArgs, context: GraphqlResolverContext) => authForgotPasswordAction(args, context));

export const authResetPassword = resolverFn(
  'authResetPassword',
  GraphQLOperationType.MUTATION,
)(async (args: AuthResetPasswordArgs, context: GraphqlResolverContext) => authResetPasswordAction(args, context));

export const authChangePassword = resolverFn(
  'authChangePassword',
  GraphQLOperationType.MUTATION,
)(async (args: AuthChangePasswordArgs, context: GraphqlResolverContext) => authChangePasswordAction(args, context));

export const authVerifyEmail = resolverFn(
  'authVerifyEmail',
  GraphQLOperationType.MUTATION,
)(async (args: AuthVerifyEmailArgs, context: GraphqlResolverContext) => authVerifyEmailAction(args, context));

export const authResendVerification = resolverFn(
  'authResendVerification',
  GraphQLOperationType.MUTATION,
)(async (args: AuthResendVerificationArgs, context: GraphqlResolverContext) => authResendVerificationAction(args, context));

export const authSendEmailOtp = resolverFn(
  'authSendEmailOtp',
  GraphQLOperationType.MUTATION,
)(async (args: AuthSendEmailOtpArgs, context: GraphqlResolverContext) => authSendEmailOtpAction(args, context));

export const authVerifyOtp = resolverFn(
  'authVerifyOtp',
  GraphQLOperationType.MUTATION,
)(async (args: AuthVerifyOtpArgs, context: GraphqlResolverContext) => authVerifyOtpAction(args, context));
