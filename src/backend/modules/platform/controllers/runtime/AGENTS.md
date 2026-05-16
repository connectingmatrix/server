# AGENTS.md

## Directory Context

- Path: `packages/apps/general/src/controllers/runtime`
- This folder owns the production code files in this folder.

## Contract

- Keep all code in this folder aligned with its layer package boundary.
- If any production code file in this folder is updated, update this AGENTS.md in the same change.
- This AGENTS file must document each owned file purpose, input/output shape, role rules, logic gates, functions, exports, and line snippets.

## File Usage Specification

### `agent-app-live.controller.ts`
- Purpose: Defines module behavior owned by this usage folder.
- Owning use cases: Runtime and application flows that import this file through package boundaries.
- Input shape: Typed arguments and imported contracts declared in this file signatures.
- Output shape: Typed return values, thrown errors, and exported contracts declared in this file.
- Role interaction rules:
  - `User`: Allowed through explicit service/resolver authorization and scoped data access only.
  - `Root User`: Can execute elevated flows where caller context resolves root privileges.
  - `Super Admin`: Can execute organization-level privileged flows where membership and role gates pass.
- Logic gates summary:
  - Authorization and scope checks must run before read/write side effects.
  - Entity/ORM boundaries must remain the source of persisted data access.
  - MCP or GraphQL proxy boundaries must avoid duplicated domain validation.
- Functions (all):
  - `AgentAppLiveController` (L13-L13, class)
  - `readIndex` (L15-L15, method)
  - `readCompatibilityApi` (L23-L23, method)
  - `readAsset` (L58-L58, method)
  - `sendDeploymentFile` (L70-L70, method)
  - `compatibilityApi` (L77-L77, method)
- Exports:
  - `AgentAppLiveController` (L13)
- Key snippets and use-case mapping:
  - `L13-L13`: Implements `AgentAppLiveController` for this module use case.
  - `L15-L15`: Implements `readIndex` for this module use case.
  - `L23-L23`: Implements `readCompatibilityApi` for this module use case.
  - `L58-L58`: Implements `readAsset` for this module use case.
  - `L70-L70`: Implements `sendDeploymentFile` for this module use case.
  - `L77-L77`: Implements `compatibilityApi` for this module use case.
### `agent-ui.controller.ts`
- Purpose: Defines module behavior owned by this usage folder.
- Owning use cases: Runtime and application flows that import this file through package boundaries.
- Input shape: Typed arguments and imported contracts declared in this file signatures.
- Output shape: Typed return values, thrown errors, and exported contracts declared in this file.
- Role interaction rules:
  - `User`: Allowed through explicit service/resolver authorization and scoped data access only.
  - `Root User`: Can execute elevated flows where caller context resolves root privileges.
  - `Super Admin`: Can execute organization-level privileged flows where membership and role gates pass.
- Logic gates summary:
  - Authorization and scope checks must run before read/write side effects.
  - Entity/ORM boundaries must remain the source of persisted data access.
  - MCP or GraphQL proxy boundaries must avoid duplicated domain validation.
- Functions (all):
  - `text` (L11-L11, arrow)
  - `AgentUiController` (L15-L15, class)
  - `createChatKitSession` (L17-L17, method)
  - `aiSdkChat` (L29-L29, method)
- Exports:
  - `AgentUiController` (L15)
- Key snippets and use-case mapping:
  - `L11-L11`: Implements `text` for this module use case.
  - `L15-L15`: Implements `AgentUiController` for this module use case.
  - `L17-L17`: Implements `createChatKitSession` for this module use case.
  - `L29-L29`: Implements `aiSdkChat` for this module use case.
### `workflow-fixtures.controller.ts`
- Purpose: Defines module behavior owned by this usage folder.
- Owning use cases: Runtime and application flows that import this file through package boundaries.
- Input shape: Typed arguments and imported contracts declared in this file signatures.
- Output shape: Typed return values, thrown errors, and exported contracts declared in this file.
- Role interaction rules:
  - `User`: Allowed through explicit service/resolver authorization and scoped data access only.
  - `Root User`: Can execute elevated flows where caller context resolves root privileges.
  - `Super Admin`: Can execute organization-level privileged flows where membership and role gates pass.
- Logic gates summary:
  - Authorization and scope checks must run before read/write side effects.
  - Entity/ORM boundaries must remain the source of persisted data access.
  - MCP or GraphQL proxy boundaries must avoid duplicated domain validation.
- Functions (all):
  - `WorkflowFixturesController` (L11-L11, class)
  - `downloadLatestAiAgentWorkflow` (L13-L13, method)
  - `importLatestAiAgentWorkflow` (L23-L23, method)
- Exports:
  - `WorkflowFixturesController` (L11)
- Key snippets and use-case mapping:
  - `L11-L11`: Implements `WorkflowFixturesController` for this module use case.
  - `L13-L13`: Implements `downloadLatestAiAgentWorkflow` for this module use case.
  - `L23-L23`: Implements `importLatestAiAgentWorkflow` for this module use case.
### `workflow-webhook.controller.ts`
- Purpose: Defines module behavior owned by this usage folder.
- Owning use cases: Runtime and application flows that import this file through package boundaries.
- Input shape: Typed arguments and imported contracts declared in this file signatures.
- Output shape: Typed return values, thrown errors, and exported contracts declared in this file.
- Role interaction rules:
  - `User`: Allowed through explicit service/resolver authorization and scoped data access only.
  - `Root User`: Can execute elevated flows where caller context resolves root privileges.
  - `Super Admin`: Can execute organization-level privileged flows where membership and role gates pass.
- Logic gates summary:
  - Authorization and scope checks must run before read/write side effects.
  - Entity/ORM boundaries must remain the source of persisted data access.
  - MCP or GraphQL proxy boundaries must avoid duplicated domain validation.
- Functions (all):
  - `resolveOwnerId` (L28-L28, function)
  - `createWebhookErrorPayload` (L41-L41, function)
  - `WorkflowWebhookController` (L47-L47, class)
  - `resolveWebhookInvocation` (L48-L48, method)
  - `handleRequest` (L150-L150, method)
  - `handleAsyncPublished` (L242-L242, method)
  - `handlePublishedExecutionStatus` (L274-L274, method)
  - `getTest` (L295-L295, method)
  - `postTest` (L300-L300, method)
  - `getPublished` (L305-L305, method)
  - `postPublished` (L310-L310, method)
  - `getPublishedAsync` (L315-L315, method)
  - `postPublishedAsync` (L320-L320, method)
- Exports:
  - `WorkflowWebhookController` (L47)
- Key snippets and use-case mapping:
  - `L28-L28`: Implements `resolveOwnerId` for this module use case.
  - `L41-L41`: Implements `createWebhookErrorPayload` for this module use case.
  - `L47-L47`: Implements `WorkflowWebhookController` for this module use case.
  - `L48-L48`: Implements `resolveWebhookInvocation` for this module use case.
  - `L150-L150`: Implements `handleRequest` for this module use case.
  - `L242-L242`: Implements `handleAsyncPublished` for this module use case.
  - `L274-L274`: Implements `handlePublishedExecutionStatus` for this module use case.
  - `L295-L295`: Implements `getTest` for this module use case.
  - `L300-L300`: Implements `postTest` for this module use case.
  - `L305-L305`: Implements `getPublished` for this module use case.
  - `L310-L310`: Implements `postPublished` for this module use case.
  - `L315-L315`: Implements `getPublishedAsync` for this module use case.
  - `L320-L320`: Implements `postPublishedAsync` for this module use case.

## Non-Negotiable Coding Standards

- Never ever write supabase.from we have entities always load data through it
- Do not use `supabase.from` or `input.from` directly. Load data through entities and the ORM.
- Do not add autofills
- Do not add placeholder, do not add normalisation.
- Find and fix the root cause instead of adding the fallback.
- Do not add fallbacks. Fix the logic.
- Everything should be typed dont use unknown, never, any
- Do not use JS-style safe/coercion helper functions.
- Do not use `to*` functions like `toPayload`.
- Do not create map functions.
- Do not check types like `type === Array` or `type === string`.
- Use the `||` operator for comparison.
- Do not write a code file bigger than 70-100 lines.
- Try to generalise multiple lines of code into fewer lines.
- After writing code, recheck patterns across the workspace to remove duplications.
- Do not invent functionality. Ask the user if it already exists somewhere.
- Prefer the smallest correct change over broad refactors.
- Preserve the repo's existing style, structure, and package manager.
- Avoid destructive git commands unless explicitly requested.
- Keep memory entries concise, factual, and tied to the files or behavior that changed.
- Entity table name should come from the Entity and not direct usage.
- Function naming should be .create, .delete .find .update .find .findBy .deleteBy
- Disallowed naming conventions are createRows, listRows and any programatic name for the entity.
- Importing supabase in the entities is disallowed. Upgrade the ORM file is something is not supported by entity. Orm is present at @gigav2/orm
- If Create, Update, Delete, Find is unable to do any thing stop the coding and inform the user of your updates first.
- Do not create proxy or additional functions for create, update, delete
- Keep ORM generic do not add Entity functions in the ORM
- MCP.ts will execute inner graphql for the operations they will not implement any
- JSON is disallowed in the Graphql Schema use proper types only
- Dont use zod for typing
