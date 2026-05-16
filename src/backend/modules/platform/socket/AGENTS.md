# Socket Boundaries + Event Contract

## Folder Purpose

- Own all socket transports for chat, workflow, and runtime monitoring.
- Keep transport wiring thin and delegate business logic to services/entities.

## Hard Rules

- No direct `supabase.from` access in socket handlers.
- Keep event payloads strictly typed and reject unknown required-shape breaks.
- Emit and log through shared socket telemetry helpers.
- Keep UI-facing contracts stable: `chat:*` and `runtime:*` payload shape is authoritative.

## Runtime Monitor Contract

- Path: `/ws/runtime`
- Auth: bearer token in socket handshake
- Client emits:

```json
{
  "event": "runtime:subscribe",
  "payload": {
    "requestId": "uuid",
    "kind": "processes|workflows|agents|swarms|applications",
    "first": 25,
    "offset": 0,
    "organizationId": "uuid|null"
  }
}
```

```json
{ "event": "runtime:unsubscribe", "payload": { "subscriptionId": "runtime:room:id" } }
```

- Server emits:

```json
{
  "event": "runtime:subscribed",
  "payload": {
    "requestId": "uuid",
    "subscriptionId": "runtime:room:id",
    "snapshot": {
      "mode": "user|organization|root",
      "kind": "processes",
      "metrics": [],
      "users": [],
      "processes": [],
      "logs": [],
      "updatedAt": "iso",
      "uptime": "text"
    }
  }
}
```

```json
{
  "event": "runtime:snapshot",
  "payload": {
    "subscriptionId": "runtime:room:id",
    "snapshot": {
      "mode": "user|organization|root",
      "kind": "processes",
      "metrics": [],
      "users": [],
      "processes": [],
      "logs": [],
      "updatedAt": "iso",
      "uptime": "text"
    }
  }
}
```

```json
{
  "event": "runtime:event",
  "payload": {
    "subscriptionId": "runtime:room:id",
    "event": {
      "kind": "workflow.run|agent.run|application.run|runtime.process",
      "status": "running|queued|completed|failed|stopped|sleeping|zombie",
      "message": "text",
      "timestamp": "iso",
      "runId": "string|null",
      "userId": "uuid|null",
      "agentId": "uuid|null",
      "swarmId": "uuid|null",
      "pid": "string|null"
    }
  }
}
```

```json
{ "event": "runtime:error", "payload": { "requestId": "uuid|null", "message": "text" } }
```

## Chat Timeline Contract

- Path: `/ws/chat`
- Client emits:

```json
{
  "event": "chat:send",
  "payload": {
    "request_id": "uuid",
    "chat_id": "uuid|null",
    "message": "text",
    "chat_mode": "DEFAULT|AGENT|WORKFLOW|SWARM",
    "agent_id": "uuid|null",
    "workflow_id": "uuid|null",
    "swarm_id": "uuid|null",
    "scope": { "type": "channel|category|subject|post|temporary", "id": "uuid", "organizationId": "uuid|null" }
  }
}
```

- Server emits:

```json
{ "event": "chat:ack", "payload": { "request_id": "uuid", "status": "accepted" } }
```

```json
{
  "event": "chat:debug",
  "payload": {
    "request_id": "uuid",
    "chat_id": "uuid|null",
    "stage": "input.received|socket.ack|planner|tool.call|assistant.done|chat.error",
    "status": "started|progress|completed|failed",
    "message": "text",
    "timestamp": "iso",
    "meta": {}
  }
}
```

```json
{
  "event": "chat:assistant:done",
  "payload": {
    "request_id": "uuid",
    "data": { "chat": { "id": "uuid" }, "messages": { "assistant": { "id": "uuid", "content": "text", "created_at": "iso" } } }
  }
}
```

```json
{ "event": "chat:error", "payload": { "request_id": "uuid|null", "error": "text" } }
```

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
