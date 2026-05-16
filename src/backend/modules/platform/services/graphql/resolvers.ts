import {
  authChangePassword,
  authForgotPassword,
  authLogin,
  authLogout,
  authPing,
  authRefreshToken,
  authResendVerification,
  authResetPassword,
  authSendEmailOtp,
  authSignup,
  authSignupOrganisation,
  authVerifyEmail,
  authVerifyOtp,
} from './resolvers/auth/auth.resolver';
import { ActivityLogResolver } from './resolvers/telemetry/activity-log.resolver';
import { BookmarkResolver } from './resolvers/integration/bookmark.resolver';
import { GraphqlCustomResolverModule } from './resolvers/integration/base';
import { CategoryResolver } from './resolvers/integration/category.resolver';
import { BillingResolver } from './resolvers/integration/billing.resolver';
import { ChannelResolver } from './resolvers/integration/channel.resolver';
import { ChatResolver } from './resolvers/integration/chat.resolver';
import { CredentialResolver } from './resolvers/integration/credential.resolver';
import { OrgResolver } from './resolvers/integration/org.resolver';
import { McpResolver } from './resolvers/integration/mcp.resolver';
import { OnboardingResolver } from './resolvers/integration/onboarding.resolver';
import { PlanPolicyResolver } from './resolvers/integration/plan-policy.resolver';
import { PostResolver } from './resolvers/integration/post.resolver';
import { SubjectResolver } from './resolvers/integration/subject.resolver';
import { SharedSpaceResolver } from './resolvers/integration/shared-space.resolver';
import { WorkflowResolver } from './resolvers/integration/workflow.resolver';

type ResolverClass = new (...args: any[]) => Record<string, any>;

const RESOLVER_CLASSES: ResolverClass[] = [
  ActivityLogResolver,
  BookmarkResolver,
  BillingResolver,
  CategoryResolver,
  ChannelResolver,
  ChatResolver,
  CredentialResolver,
  McpResolver,
  OnboardingResolver,
  OrgResolver,
  PlanPolicyResolver,
  PostResolver,
  SharedSpaceResolver,
  SubjectResolver,
  WorkflowResolver,
];

const resolverInstances = new Map<ResolverClass, Record<string, any>>();

function getResolverInstance(ResolverType: ResolverClass): Record<string, any> {
  if (!resolverInstances.has(ResolverType)) {
    resolverInstances.set(ResolverType, new ResolverType());
  }
  return resolverInstances.get(ResolverType)!;
}

function installResolverMethodDelegates() {
  const target = GraphqlCustomResolverModule.prototype as Record<string, any>;

  for (const ResolverType of RESOLVER_CLASSES) {
    const source = ResolverType.prototype as Record<string, any>;
    for (const key of Object.getOwnPropertyNames(source)) {
      if (key === 'constructor' || key === 'getService') {
        continue;
      }
      if (typeof source[key] !== 'function' || key in target) {
        continue;
      }

      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: function resolverMethodDelegate(this: GraphqlCustomResolverModule, ...args: unknown[]) {
          const service = getResolverInstance(ResolverType) as Record<string, (...fnArgs: unknown[]) => unknown>;
          const method = service[key];
          if (typeof method !== 'function') {
            throw new Error(`Resolver method "${key}" is not available on ${ResolverType.name}.`);
          }
          return method.apply(service, args);
        },
      });
    }
  }
}

installResolverMethodDelegates();

export {
  ActivityLogResolver,
  BookmarkResolver,
  authChangePassword,
  authForgotPassword,
  authLogin,
  authLogout,
  authPing,
  authRefreshToken,
  authResendVerification,
  authResetPassword,
  authSendEmailOtp,
  authSignup,
  authSignupOrganisation,
  authVerifyEmail,
  authVerifyOtp,
  CategoryResolver,
  BillingResolver,
  ChannelResolver,
  ChatResolver,
  CredentialResolver,
  McpResolver,
  GraphqlCustomResolverModule,
  OrgResolver,
  OnboardingResolver,
  PlanPolicyResolver,
  PostResolver,
  SharedSpaceResolver,
  SubjectResolver,
  WorkflowResolver,
};
