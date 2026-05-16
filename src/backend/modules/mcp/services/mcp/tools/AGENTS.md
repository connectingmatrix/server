# AGENTS.md

## Directory Context

- Path: `packages/apps/mcp/src/services/mcp/tools`
- This folder owns the production code files in this folder.

## Contract

- Keep all code in this folder aligned with its layer package boundary.
- If any production code file in this folder is updated, update this AGENTS.md in the same change.
- This AGENTS file must document each owned file purpose, input/output shape, role rules, logic gates, functions, exports, and line snippets.
- MCP handlers in this folder must remain GraphQL-proxy driven and must not re-implement domain business logic.

## File Usage Specification

### `action-runtime.ts`

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
  - `inputRecord` (L5-L5, arrow)
  - `runtimeScopeType` (L7-L7, arrow)
- Exports:
  - None
- Key snippets and use-case mapping:
  - `L5-L5`: Implements `inputRecord` for this module use case.
  - `L7-L7`: Implements `runtimeScopeType` for this module use case.

### `audit.ts`

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
  - `requireOrgMembership` (L6-L6, arrow)
- Exports:
  - None
- Key snippets and use-case mapping:
  - `L6-L6`: Implements `requireOrgMembership` for this module use case.

### `chat-actions.ts`

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
  - `runWorkflowAction` (L58-L58, function)
  - `mcpEntityContext` (L64-L64, function)
- Exports:
  - None
- Key snippets and use-case mapping:
  - `L58-L58`: Implements `runWorkflowAction` for this module use case.
  - `L64-L64`: Implements `mcpEntityContext` for this module use case.
  - `L3-L4`: Routes tree action detection/execution through `@giga/ai-actions/tree-actions` so MCP reuses consolidated action ownership.

### `chat.ts`

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
  - `chatScopeInput` (L11-L11, arrow)
- Exports:
  - `chatScopeInput` (L11)
- Key snippets and use-case mapping:
  - `L11-L11`: Implements `chatScopeInput` for this module use case.

### `common.ts`

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
  - `stringProp` (L14-L14, arrow)
  - `boolProp` (L15-L15, arrow)
  - `jsonProp` (L16-L16, arrow)
  - `limit` (L17-L17, arrow)
  - `inputRecord` (L19-L19, arrow)
  - `requireRecord` (L22-L22, arrow)
  - `enforceKeys` (L27-L27, arrow)
  - `pathSegments` (L32-L32, arrow)
  - `workflowScope` (L40-L40, arrow)
  - `stringList` (L45-L45, arrow)
- Exports:
  - `stringProp` (L14)
  - `boolProp` (L15)
  - `jsonProp` (L16)
  - `limit` (L17)
  - `inputRecord` (L19)
  - `requireRecord` (L22)
  - `enforceKeys` (L27)
  - `pathSegments` (L32)
  - `workflowScope` (L40)
  - `stringList` (L45)
- Key snippets and use-case mapping:
  - `L14-L14`: Implements `stringProp` for this module use case.
  - `L15-L15`: Implements `boolProp` for this module use case.
  - `L16-L16`: Implements `jsonProp` for this module use case.
  - `L17-L17`: Implements `limit` for this module use case.
  - `L19-L19`: Implements `inputRecord` for this module use case.
  - `L22-L22`: Implements `requireRecord` for this module use case.
  - `L27-L27`: Implements `enforceKeys` for this module use case.
  - `L32-L32`: Implements `pathSegments` for this module use case.
  - `L40-L40`: Implements `workflowScope` for this module use case.
  - `L45-L45`: Implements `stringList` for this module use case.

### `identity.ts`

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
  - `visibleOrganizations` (L6-L6, arrow)
- Exports:
  - None
- Key snippets and use-case mapping:
  - `L6-L6`: Implements `visibleOrganizations` for this module use case.

### `nodes.ts`

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
  - `nodeInput` (L18-L18, arrow)
  - `ensureNodePackage` (L31-L31, arrow)
- Exports:
  - `nodeMcpTools` (L61)
- Key snippets and use-case mapping:
  - `L18-L18`: Implements `nodeInput` for this module use case.
  - `L31-L31`: Implements `ensureNodePackage` for this module use case.

### `prompt-suite.ts`

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
  - `prompts` (L9-L9, arrow)
- Exports:
  - None
- Key snippets and use-case mapping:
  - `L9-L9`: Implements `prompts` for this module use case.

### `shared-space.ts`

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
  - `org` (L9-L9, arrow)
  - `writeBase64File` (L11-L11, arrow)
  - `downloadUrl` (L17-L17, arrow)
  - `chatAttachmentToDrive` (L24-L24, arrow)
- Exports:
  - None
- Key snippets and use-case mapping:
  - `L9-L9`: Implements `org` for this module use case.
  - `L11-L11`: Implements `writeBase64File` for this module use case.
  - `L17-L17`: Implements `downloadUrl` for this module use case.
  - `L24-L24`: Implements `chatAttachmentToDrive` for this module use case.

### `tree.ts`

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
  - None detected by static scan.
- Exports:
  - None
- Key snippets and use-case mapping:
  - `L1-L1`: Imports tree runtime delegates from `@giga/ai-actions/tree-actions` to enforce MCP->ai-actions consolidation.
  - `L6-L119`: Defines MCP handler bindings and input schemas for tree fetch/run/ensure operations.

### `workflow-execution.ts`

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
  - `workflowOrgId` (L19-L19, arrow)
  - `stringHeaders` (L22-L22, arrow)
  - `loadWorkflow` (L31-L31, arrow)
  - `realtime` (L47-L47, arrow)
  - `executeWorkflow` (L58-L58, arrow)
- Exports:
  - None
- Key snippets and use-case mapping:
  - `L19-L19`: Implements `workflowOrgId` for this module use case.
  - `L22-L22`: Implements `stringHeaders` for this module use case.
  - `L31-L31`: Implements `loadWorkflow` for this module use case.
  - `L47-L47`: Implements `realtime` for this module use case.
  - `L58-L58`: Implements `executeWorkflow` for this module use case.

### `workflow.ts`

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
  - `workflowBackendRequest` (L9-L9, arrow)
  - `listWorkflows` (L22-L22, arrow)
  - `manageWorkflow` (L55-L55, arrow)
  - `ensureWorkflow` (L63-L63, arrow)
  - `workflowRealtimeBinding` (L73-L73, arrow)
- Exports:
  - None
- Key snippets and use-case mapping:
  - `L9-L9`: Implements `workflowBackendRequest` for this module use case.
  - `L22-L22`: Implements `listWorkflows` for this module use case.
  - `L55-L55`: Implements `manageWorkflow` for this module use case.
  - `L63-L63`: Implements `ensureWorkflow` for this module use case.
  - `L73-L73`: Implements `workflowRealtimeBinding` for this module use case.

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
