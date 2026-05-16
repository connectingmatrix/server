# AGENTS.md

## Directory Context

- Path: `packages/apps/mcp/src/services/capabilities`
- This folder owns MCP capability registry contracts used by execute-backend dispatch.

## Contract

- Keep MCP capability registry deterministic and side-effect free unless calling registered MCP server adapters.
- Keep output summaries explicit for capability listing/execution commands.
- This MCP-facing folder participates in GraphQL-proxy execution paths through MCP runtime integration and must preserve GraphQL contract wording.
- If production files here change, update this AGENTS file in the same diff.

## File Usage Specification

### `mcp-capability-registry.ts`
- Purpose: Registry and execution surface for MCP tool/resource/prompt capabilities.
- Input shape: Server registration objects and execution payload records.
- Output shape: Structured capability listing/execution result objects.
- Role interaction rules:
  - `User`: Executes capabilities only through downstream policy-gated tool dispatch.
  - `Root User`: Can execute same registry surface with elevated policy context downstream.
  - `Super Admin`: Can execute same registry surface with elevated policy context downstream.
- Logic gates summary:
  - Registered server lookup is mandatory before execution.
  - Capability kind (`tool|resource|prompt`) gates execution path routing.
- Functions (all):
  - `registerMcpServer`
  - `listMcpCapabilities`
  - `executeMcpCapability`
- Exports:
  - `registerMcpServer`
  - `listMcpCapabilities`
  - `executeMcpCapability`
  - `McpCapability` type
- Key snippets and use-case mapping:
  - `L1-L23`: Defines MCP capability and server registry contracts.
  - `L24-L45`: Builds capability listing output for discovery APIs.
  - `L46-L58`: Executes selected capability route by kind and server binding.

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
