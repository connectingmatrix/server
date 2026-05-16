# AGENTS.md

## Directory Context

- Path: `packages/apps/mcp/src`
- This folder owns the package entry surface for MCP runtime exports.

## Contract

- Expose stable entry exports for general controller/resolver integration.
- Delegate protocol/runtime logic to `services/mcp/*` modules.
- Keep GraphQL-proxy wording and behavior unchanged in downstream MCP modules.
- If production files here change, update this AGENTS file in the same diff.

## File Usage Specification

### `index.ts`
- Purpose: Package entrypoint exposing MCP context/protocol/tool runtime APIs.
- Input shape: Exported symbols from `services/mcp/context`, `services/mcp/protocol`, and `services/mcp/tools`.
- Output shape: Stable `@giga/mcp` import surface.
- Role interaction rules:
  - `User`: No direct runtime interaction through this entry file.
  - `Root User`: No direct runtime interaction through this entry file.
  - `Super Admin`: No direct runtime interaction through this entry file.
- Logic gates summary:
  - Keep compatibility for existing internal imports.
- Functions (all):
  - None.
- Exports:
  - `* from ./services/mcp/context`
  - `* from ./services/mcp/protocol`
  - `* from ./services/mcp/tools`
- Key snippets and use-case mapping:
  - `L1-L3`: Re-export contract consumed by `@giga/general` controller/resolver integration.

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
