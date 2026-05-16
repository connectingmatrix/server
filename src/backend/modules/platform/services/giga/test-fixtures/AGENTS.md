# AGENTS.md

## Directory Context

- Path: `packages/apps/general/src/services/giga/test-fixtures`
- This folder owns the production code files in this folder.

## Contract

- Keep all code in this folder aligned with its layer package boundary.
- If any production code file in this folder is updated, update this AGENTS.md in the same change.
- This AGENTS file must document each owned file purpose, input/output shape, role rules, logic gates, functions, exports, and line snippets.

## File Usage Specification

### `giga-ai-test-tree.ts`
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
  - `deterministicFixtureUuid` (L53-L53, function)
  - `textFlag` (L59-L59, function)
  - `boolFlag` (L64-L64, function)
  - `cleanProps` (L74-L74, function)
  - `configureFixtureNeoEnv` (L85-L85, function)
  - `createEmptyShape` (L91-L91, function)
  - `pushNode` (L104-L104, function)
  - `pushEdge` (L113-L113, function)
  - `gigaAiTestSubjectSupabaseId` (L138-L138, function)
  - `gigaAiTestPostSupabaseId` (L142-L142, function)
  - `pushSubject` (L146-L146, function)
  - `addSmallFixture` (L159-L159, function)
  - `addLargeFixture` (L438-L438, function)
  - `buildFixtureShape` (L507-L507, function)
  - `mergeNodesByLabel` (L531-L531, function)
  - `mergeEdges` (L535-L535, function)
  - `seedGigaAiTestGraph` (L560-L560, function)
  - `cleanupGigaAiTestGraph` (L586-L586, function)
  - `toPostBaseId` (L600-L600, function)
  - `buildPostRows` (L604-L604, function)
  - `buildSubjectRows` (L636-L636, function)
  - `seedGigaAiTestPosts` (L649-L649, function)
  - `cleanupGigaAiTestPosts` (L668-L668, function)
  - `fixtureSizeFromInput` (L684-L684, function)
  - `fixtureBoolFromInput` (L692-L692, function)
  - `resetGigaAiTestNeoConnection` (L696-L696, function)
- Exports:
  - `gigaAiTestSubjectSupabaseId` (L138)
  - `seedGigaAiTestGraph` (L560)
  - `cleanupGigaAiTestGraph` (L586)
  - `seedGigaAiTestPosts` (L649)
  - `cleanupGigaAiTestPosts` (L668)
  - `fixtureSizeFromInput` (L684)
  - `fixtureBoolFromInput` (L692)
  - `resetGigaAiTestNeoConnection` (L696)
- Key snippets and use-case mapping:
  - `L53-L53`: Implements `deterministicFixtureUuid` for this module use case.
  - `L59-L59`: Implements `textFlag` for this module use case.
  - `L64-L64`: Implements `boolFlag` for this module use case.
  - `L74-L74`: Implements `cleanProps` for this module use case.
  - `L85-L85`: Implements `configureFixtureNeoEnv` for this module use case.
  - `L91-L91`: Implements `createEmptyShape` for this module use case.
  - `L104-L104`: Implements `pushNode` for this module use case.
  - `L113-L113`: Implements `pushEdge` for this module use case.
  - `L138-L138`: Implements `gigaAiTestSubjectSupabaseId` for this module use case.
  - `L142-L142`: Implements `gigaAiTestPostSupabaseId` for this module use case.
  - `L146-L146`: Implements `pushSubject` for this module use case.
  - `L159-L159`: Implements `addSmallFixture` for this module use case.
  - `L438-L438`: Implements `addLargeFixture` for this module use case.
  - `L507-L507`: Implements `buildFixtureShape` for this module use case.
  - `L531-L531`: Implements `mergeNodesByLabel` for this module use case.
  - `L535-L535`: Implements `mergeEdges` for this module use case.
  - `L560-L560`: Implements `seedGigaAiTestGraph` for this module use case.
  - `L586-L586`: Implements `cleanupGigaAiTestGraph` for this module use case.
  - `L600-L600`: Implements `toPostBaseId` for this module use case.
  - `L604-L604`: Implements `buildPostRows` for this module use case.
  - `L636-L636`: Implements `buildSubjectRows` for this module use case.
  - `L649-L649`: Implements `seedGigaAiTestPosts` for this module use case.
  - `L668-L668`: Implements `cleanupGigaAiTestPosts` for this module use case.
  - `L684-L684`: Implements `fixtureSizeFromInput` for this module use case.
  - `L692-L692`: Implements `fixtureBoolFromInput` for this module use case.
  - `L696-L696`: Implements `resetGigaAiTestNeoConnection` for this module use case.

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
