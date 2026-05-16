import { GETTING_STARTED_CONTENT_VERSION } from './constants';
import { GETTING_STARTED_WORKFLOW_NODES, GettingStartedWorkflowNodeReference } from './workflow-node-reference.generated';

export interface GettingStartedGuideInput {
  categoryId: string;
  channelId: string;
  channelName: string;
  postId?: string | null;
  subjectId: string;
}

function renderPorts(node: GettingStartedWorkflowNodeReference): string {
  const inputs = node.inputs.map((port) => `${port.key} (${port.portType})`).join(', ') || 'none';
  const outputs = node.outputs.map((port) => `${port.key} (${port.portType})`).join(', ') || 'none';
  const commands = node.commands.map((port) => `${port.key} (${port.side || 'control'})`).join(', ') || 'none';
  return `| ${node.name} | ${node.group} | ${node.summary} | ${inputs} | ${outputs} | ${commands} |`;
}

function renderNodeReference(): string {
  return [
    '| Node | Group | Purpose | Inputs | Outputs | Command Ports |',
    '| --- | --- | --- | --- | --- | --- |',
    ...GETTING_STARTED_WORKFLOW_NODES.map(renderPorts),
  ].join('\n');
}

export function buildGettingStartedMarkdown(input: GettingStartedGuideInput): string {
  const createPostPath = `/post/create?subjectId=${encodeURIComponent(input.subjectId)}&subjectName=General`;
  const postPath = input.postId
    ? `/chat/post/${encodeURIComponent(input.postId)}?subjectId=${encodeURIComponent(
        input.subjectId,
      )}&subjectName=General&postTitle=Getting%20Started`
    : `/chat/subject/${encodeURIComponent(input.subjectId)}?subjectName=General`;
  return `# Getting Started With Giga Intelligence

Content version: ${GETTING_STARTED_CONTENT_VERSION}

Welcome to Giga Intelligence. This post is your live onboarding workspace. You can read it like a guide, chat with the AI about any section, ask the AI to create workspace objects, and use Workflow AI to build automations.

## Your Default Workspace

Every user starts with a personal workspace:

- Channel: ${input.channelName}
- Category: General
- Subject: General
- Post: Getting Started

Use [Workspace](/u) to open the tree, [General subject chat](/chat/subject/${encodeURIComponent(
    input.subjectId,
  )}?subjectName=General) to ask subject-wide questions, [this Getting Started chat](${postPath}) to ask about this guide, and [Create a post](${createPostPath}) to add your first note.

\`\`\`mermaid
flowchart LR
  "Channel: ${input.channelName}" --> "Category: General"
  "Category: General" --> "Subject: General"
  "Subject: General" --> "Post: Getting Started"
\`\`\`

## How To Use The Workspace

Channels group your major areas of work. Categories organize channels into smaller sections. Subjects are focused knowledge spaces where posts, files, and chat context live. Posts are the durable knowledge units; attach PDFs, Markdown, CSV, images, or notes so the AI can answer against your own material.

Ask the Getting Started chat things like "create a channel for sales research", "create a category named Q2", "make a subject for Iran threat reports", "draft a post about my workflow", or "explain which workflow node I should use." Mutations must still pass your permissions and plan limits.

## Chat And Agentic Work

All chat boxes use the placeholder "Help me understand...". Use the subject chat or Getting Started chat when you want the assistant to explain the platform using this post, Markdown, and PDF context. Start with "Help me understand this workspace" when you want a guided introduction.

## Workflows

Workflows automate repeatable work. Open [Workflows](/workflows) to create or manage them. A typical workflow begins at Start, moves data through processing nodes, calls tools or LLM nodes, formats output, and finishes with Respond End.

Workflow AI can create or repair workflows from a prompt. Describe the goal, the data source, required format, and final output. For example: "Search Iran news, assess threats, sort by severity, generate CSV, and respond with a Markdown table." Workflow AI should connect data ports for values and command ports for control/tool access.

\`\`\`mermaid
flowchart LR
  "Start" --> "Code"
  "Code" --> "AI Governor"
  "AI Governor" --> "Output Format"
  "Output Format" --> "Respond End"
  "AI Governor" -. "command/tools" .-> "SERP Search"
  "AI Governor" -. "command/llm" .-> "OpenAI"
\`\`\`

## Ports

Data ports carry values between nodes. Use input/output ports for JSON, text, arrays, or structured records. Command ports connect governors/controllers to tool or LLM peers and should not be treated as normal execution order edges. LLM ports connect model providers. Tool ports expose capabilities such as SERP search, code execution, retrieval, or workflow actions.

## Credentials

Use [Credentials](/settings/global-credentials) to connect external services such as OpenAI, SerpAPI, storage, or business APIs. Secrets must be entered by you; the AI can help explain required fields but cannot invent or silently store secret values. Credential visibility and execution are controlled by credential permissions.

## Pricing, Plans, And Limits

Use [Pricing](/pricing) to review access. Plans control app access, workflow credits, Workflow AI usage, node designer access, workflow execution, attachment limits, and workspace limits. If an action is blocked, the app should show a plan or permission message instead of creating partial data.

## Platform Operations You Can Ask The AI To Perform

- Create channels, categories, subjects, and posts in your personal workspace.
- Explain or draft workflow designs.
- Create or repair workflows through Workflow AI.
- Execute persisted workflows when you have execute access.
- Explain credentials and required external service setup.
- Summarize posts and attachments from the active chat scope.

## Workflow Node Reference

${renderNodeReference()}

## Screenshots

The attached PDF and Markdown are generated from this same guide. Screenshots are captured by the repeatable Puppet script in the UI repo under doc/ctm-puppet and can be refreshed after UI changes.
`;
}
