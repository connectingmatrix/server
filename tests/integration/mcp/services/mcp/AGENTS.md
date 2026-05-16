# Test Fixture Scope

- All test-created channels, chats, workflows, posts, attachments, and fixture data must live under the `giga-ai-test` parent scope.
- Keep live/integration test data reusable and isolated under `giga-ai-test`; do not create arbitrary root-level fixture data.
- MCP tests should verify JSON-RPC protocol behavior while tool execution flows through GraphQL proxy/resolver validation.
