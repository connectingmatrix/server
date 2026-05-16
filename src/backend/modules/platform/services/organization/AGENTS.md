# AGENTS.md

## Directory Context

- Path: `packages/apps/general/src/services/organization`
- This folder owns the production code files in this folder.

## Contract

- Keep all code in this folder aligned with its layer package boundary.
- If any production code file in this folder is updated, update this AGENTS.md in the same change.
- This AGENTS file must document each owned file purpose, input/output shape, role rules, logic gates, functions, exports, and line snippets.

## File Usage Specification

### `access-guard.ts`
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
  - `requireOrganizationPermission` (L11-L11, function)
  - `assertOrganizationFeatureAllowed` (L33-L33, function)
  - `isNodeRestricted` (L47-L47, function)
- Exports:
  - `requireOrganizationPermission` (L11)
  - `assertOrganizationFeatureAllowed` (L33)
  - `isNodeRestricted` (L47)
- Key snippets and use-case mapping:
  - `L11-L11`: Implements `requireOrganizationPermission` for this module use case.
  - `L33-L33`: Implements `assertOrganizationFeatureAllowed` for this module use case.
  - `L47-L47`: Implements `isNodeRestricted` for this module use case.
### `access.ts`
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
  - `ids` (L40-L40, function)
  - `deniedByModule` (L47-L47, function)
  - `emptyContext` (L51-L51, function)
  - `getSupportedOrganizationModules` (L70-L70, function)
  - `getActiveOrganizationIds` (L74-L74, function)
  - `isOrganizationActive` (L83-L83, function)
  - `readRestrictions` (L90-L90, function)
  - `getOrganizationAccessContext` (L97-L97, function)
- Exports:
  - `getSupportedOrganizationModules` (L70)
  - `getActiveOrganizationIds` (L74)
  - `isOrganizationActive` (L83)
  - `getOrganizationAccessContext` (L97)
- Key snippets and use-case mapping:
  - `L40-L40`: Implements `ids` for this module use case.
  - `L47-L47`: Implements `deniedByModule` for this module use case.
  - `L51-L51`: Implements `emptyContext` for this module use case.
  - `L70-L70`: Implements `getSupportedOrganizationModules` for this module use case.
  - `L74-L74`: Implements `getActiveOrganizationIds` for this module use case.
  - `L83-L83`: Implements `isOrganizationActive` for this module use case.
  - `L90-L90`: Implements `readRestrictions` for this module use case.
  - `L97-L97`: Implements `getOrganizationAccessContext` for this module use case.
### `cleanup-owned-organizations.ts`
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
  - `cleanupOwnedOrganizations` (L20-L20, function)
- Exports:
  - `cleanupOwnedOrganizations` (L20)
- Key snippets and use-case mapping:
  - `L20-L20`: Implements `cleanupOwnedOrganizations` for this module use case.
### `owner.ts`
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
  - `readOwnedOrganizationIds` (L27-L27, function)
  - `readOrganizationOwnerState` (L38-L38, function)
  - `requireOrganizationOwner` (L56-L56, function)
  - `transferOrganizationOwner` (L64-L64, function)
- Exports:
  - `readOwnedOrganizationIds` (L27)
  - `readOrganizationOwnerState` (L38)
  - `requireOrganizationOwner` (L56)
  - `transferOrganizationOwner` (L64)
- Key snippets and use-case mapping:
  - `L27-L27`: Implements `readOwnedOrganizationIds` for this module use case.
  - `L38-L38`: Implements `readOrganizationOwnerState` for this module use case.
  - `L56-L56`: Implements `requireOrganizationOwner` for this module use case.
  - `L64-L64`: Implements `transferOrganizationOwner` for this module use case.

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
