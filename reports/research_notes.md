# Research Notes

Research date: 2026-08-12.

## Verified primary-source findings

- Claude Projects are useful as self-contained chat workspaces with project knowledge and instructions, but project chat context is not a versioned QA artifact store.
- Claude Project RAG activates automatically near project context limits and retrieves relevant uploaded knowledge instead of loading all content at once.
- Claude Code should keep always-on rules in `CLAUDE.md`; reusable procedures and domain knowledge should move to Skills; subagents are for isolated high-volume work; hooks enforce deterministic guardrails.
- The Agent SDK is the right fit when the team wants a production agent harness in Python or TypeScript rather than one-off CLI use.
- Playwright Test Agents provide Planner, Generator, and Healer. Reuse them for web automation generation/healing, but add custom guardrails to prevent assertion weakening.
- Playwright API testing can validate REST APIs directly from Node.js and can share setup with browser tests.
- Agent evals should combine code-based, model-based, and human graders; code-based graders are fast, cheap, objective, and reproducible.
- Current generally available model route candidates: Claude Sonnet 5 and Claude Opus 5. Claude Opus 4.8 remains available, but Opus 5 is now the current Opus-class default candidate.

## Source URLs

- https://support.claude.com/en/articles/9517075-what-are-projects
- https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects
- https://code.claude.com/docs/en/features-overview
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/costs
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://platform.claude.com/docs/en/about-claude/pricing
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://playwright.dev/docs/test-agents
- https://playwright.dev/docs/api-testing
- https://playwright.dev/docs/trace-viewer

## Blocked item

Live Sonnet/Opus model benchmark is blocked in this local PoC because no Anthropic API key was provided. The local demo still measures the deterministic guardrail and automation layers.
