# Browser Automation Screenshot Decision

Date: 2026-06-14

This note compares three ways to let coding agents inspect the local web app and capture screenshots:

- `agent-browser`
- Playwright scripts
- Playwright MCP

The immediate trigger was an auth-flow screenshot task that produced PNGs in `docs/auth-flow-screenshots/`.

## Current Repo Evidence

The project currently has nine auth UI pages under `app/(Auth)`:

- `/signin`
- `/signin/password`
- `/signin/password/reset`
- `/signup`
- `/signup/password`
- `/verify-email`
- `/verify-otp`
- `/update-password`
- `/update-password/check-email`

The route `app/(Auth)/auth/callback/route.ts` is not a screenshot target because it is a callback route, not a rendered page.

The existing screenshot output is:

- `docs/auth-flow-screenshots/01-signin.png`
- `docs/auth-flow-screenshots/02-signin-password.png`
- `docs/auth-flow-screenshots/03-signin-password-reset.png`
- `docs/auth-flow-screenshots/04-signup.png`
- `docs/auth-flow-screenshots/05-signup-password.png`
- `docs/auth-flow-screenshots/06-verify-email.png`
- `docs/auth-flow-screenshots/07-verify-otp.png`
- `docs/auth-flow-screenshots/08-update-password.png`
- `docs/auth-flow-screenshots/09-update-password-check-email.png`

The screenshots exist and are valid PNG files. Most are `1280x720`; `07-verify-otp.png` is `1280x754`. The previous AI response claimed `1280x900`, which does not match the files on disk.

Current project state:

- `package.json` does not include Playwright as a dependency.
- No reusable screenshot script exists in the repo.
- The screenshot folder is currently the only visible untracked project change from that task.

## Decision Summary

Use `agent-browser` for exploratory agent-driven browser work.

Use a committed Playwright script when the workflow should be repeatable by humans, future agents, or CI.

Use Playwright MCP when the agent environment already has MCP set up and interactive browser control is more important than keeping the workflow shell-native.

For this repo, the practical target should be:

1. Use `agent-browser` for ad hoc UI inspection and one-off screenshot collection.
2. Add a committed Playwright script if auth-flow screenshots become a repeated QA task.
3. Do not rely on disposable hidden scripts for work that needs to be re-run or audited.

## Comparison

| Option | Best fit | Strengths | Tradeoffs |
| --- | --- | --- | --- |
| `agent-browser` | Agent-driven exploration and one-off screenshots | Shell-native, compact agent-oriented output, ref-based interactions, persistent sessions, screenshots, network/debugging tools | Newer tool; not the standard test-runner ecosystem; still needs Chrome/browser installation |
| Playwright script | Repeatable screenshot generation and CI-friendly workflows | Established ecosystem, deterministic scriptable flow, easy to commit, supports full-page and element screenshots | More boilerplate; agent has to write or maintain code; less convenient for exploratory clicking |
| Playwright MCP | Interactive agent browsing through MCP clients | Accessibility-tree driven, LLM-friendly structured browser control, deterministic tool calls | Requires MCP setup; less portable than a repo script; MCP server is explicitly not a security boundary |

## `agent-browser`

`agent-browser` is a browser automation CLI designed specifically for AI agents. Its docs describe compact text output, ref-based accessibility snapshots, 50+ commands, screenshots, sessions, network tools, streaming, debugging, profiling, and Next.js/Vercel workflows.

Important source points:

- The docs describe it as "Browser automation CLI designed for AI agents" with compact output and native Rust binaries.
- The snapshot command returns accessibility-tree refs such as `@e1`, which can then be used by commands such as `click @e2`.
- The docs position refs as context-efficient, deterministic, fast, and AI-friendly.
- The GitHub README lists install options through npm, Homebrew, Cargo, and project-local installation.
- The GitHub README says existing Chrome, Brave, Playwright, and Puppeteer installations can be detected, and that no Playwright or Node.js is required for the daemon.

Good use in this repo:

```bash
agent-browser open http://localhost:3000/signin
agent-browser snapshot -i
agent-browser screenshot docs/auth-flow-screenshots/01-signin.png --full
agent-browser close
```

Why it is attractive here:

- Codex and similar agents can call it through normal shell commands.
- Ref-based interaction avoids brittle CSS selectors for many tasks.
- Compact text output is a better fit for agent context than dumping DOM or raw JSON.
- It can be used without adding a permanent test dependency to the app.

When not to use it as the primary solution:

- If the workflow must be run in CI as a stable artifact-generation task.
- If screenshot generation should be owned by `package.json` scripts.
- If the desired output is a conventional Playwright test or visual regression suite.

## Playwright Script

Playwright is the most conventional option for repeatable browser automation. The official screenshot docs show `page.screenshot({ path: "screenshot.png" })`, full-page screenshots with `fullPage: true`, screenshots into buffers, and element screenshots.

Good use in this repo:

```ts
// scripts/screenshot-auth-flow.ts
import { chromium } from "playwright";

const routes = [
  ["/signin", "01-signin.png"],
  ["/signin/password", "02-signin-password.png"],
  ["/signin/password/reset", "03-signin-password-reset.png"],
  ["/signup", "04-signup.png"],
  ["/signup/password", "05-signup-password.png"],
  ["/verify-email?email=user@example.com", "06-verify-email.png"],
  ["/verify-otp?email=user@example.com", "07-verify-otp.png"],
  ["/update-password", "08-update-password.png"],
  ["/update-password/check-email?email=user@example.com", "09-update-password-check-email.png"],
];
```

Why it is attractive here:

- It creates a repeatable repo-level workflow.
- It can be run by a human, Codex, GitHub Actions, or another agent.
- It can pin viewport, base URL, output folder, wait strategy, and naming.
- It can later evolve into visual regression tests.

When not to use it as the primary solution:

- If the task is purely exploratory.
- If the agent needs to inspect and interact with unknown UI before deciding what screenshots matter.
- If adding dependencies and scripts is heavier than the task deserves.

## Playwright MCP

Playwright MCP exposes browser automation through an MCP server. The README describes it as using Playwright's accessibility tree rather than pixel-based input, LLM-friendly structured data, and deterministic tool application. It also documents Codex setup through `codex mcp add playwright npx "@playwright/mcp@latest"`.

Why it is attractive:

- Good for agents that already use MCP heavily.
- Strong interactive browser-control story.
- Uses accessibility information instead of vision-only control.
- Can be configured with isolated browser state and storage state.

Why it is less attractive for this repo's screenshot task:

- Requires MCP configuration outside the repo.
- Less obvious for a future human contributor to re-run.
- The Playwright MCP README explicitly says it is not a security boundary.
- A committed Playwright script is more auditable for repeatable screenshots.

## Recommendation

For one-off agent tasks:

```text
Run app locally -> use agent-browser -> save screenshots into docs/auth-flow-screenshots/ or /tmp
```

For repeatable project workflows:

```text
Add Playwright dependency -> add scripts/screenshot-auth-flow.ts -> add package.json script -> document expected output
```

For interactive debugging sessions where MCP is already configured:

```text
Use Playwright MCP -> inspect page state -> capture screenshots or guide code fixes
```

## Guardrails

- Prefer browser-only screenshots over unrestricted desktop screenshots.
- Use local dev or preview environments, not production customer data.
- Use seeded test users and local Supabase state for authenticated flows.
- Save screenshots to a known folder such as `docs/auth-flow-screenshots/` or `artifacts/screenshots/`.
- Use stable viewport dimensions and record them in the script or command.
- Add `data-testid` only for elements that are otherwise hard to identify semantically.
- Keep generated screenshots out of commits unless they are documentation artifacts or expected review artifacts.

## Open Decision

The current screenshots are sufficient as a one-time artifact, but the process was not clean enough to reuse. If auth UI review becomes recurring, add a committed Playwright screenshot script. If agent-driven UI inspection is the main goal, install and standardize on `agent-browser`.

## Source Links

- `agent-browser` docs: https://agent-browser.dev/
- `agent-browser` GitHub README: https://github.com/vercel-labs/agent-browser
- Playwright screenshot docs: https://playwright.dev/docs/screenshots
- Playwright MCP README: https://github.com/microsoft/playwright-mcp

## Source Notes

- `agent-browser` docs describe compact text output, ref-based snapshots, screenshots, network tools, sessions, and native binaries: https://agent-browser.dev/
- `agent-browser` GitHub README documents installation, Chrome requirements, quick-start commands, `snapshot`, `click @ref`, and `screenshot`: https://github.com/vercel-labs/agent-browser
- Playwright screenshot docs document `page.screenshot({ path })`, `fullPage: true`, buffers, and element screenshots: https://playwright.dev/docs/screenshots
- Playwright MCP README documents accessibility-tree based control, LLM-friendly structured data, deterministic tool application, Codex setup, and the security-boundary warning: https://github.com/microsoft/playwright-mcp
