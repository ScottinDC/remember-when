# Remember When project instructions

## Jira is the system of record

All feature requests, bugs, housekeeping, QA, penetration testing, security
remediation, and release work must run through the shared Edit Request Jira project
`KAN` at https://scottsworkspace-43475593.atlassian.net.
Always apply the `remember-when` label and prefix new issue titles with
`Remember When:`. Scope searches to `project = KAN AND labels = "remember-when"`;
this shared space also contains other projects' work.

Read [the Jira workflow](docs/JIRA-WORKFLOW.md) before starting project work.

- Use Composio to search for and read the relevant `KAN` issue before changing
  code or starting tests. Create a scoped issue when no existing issue fits;
  search first to avoid duplicates. Routine conversation and read-only discovery
  to identify the correct ticket do not require a new issue.
- Confirm the connected Jira site and project ID `10000`. An account alias may
  name another project; never infer the target project from the alias.
- Record scope, acceptance criteria, workstream label, and verification plan.
  Move the issue to In Progress when work starts using freshly fetched transitions.
- Include the issue key in new branch names (`codex/KAN-123-short-description`),
  commit messages and PR titles. Do not rename existing branches just for this rule.
- Update Jira with material progress, blockers, decisions, PR links and evidence.
  New work discovered during execution belongs in linked Jira issues, not an
  untracked local TODO list or a separate GitHub backlog.
- Use In Review while implementation or validation awaits review. Move to Done
  only when the ticket's acceptance criteria are satisfied. Record environment,
  commit/patch identity, checks and remaining limits; local tests do not prove
  deployment or real-device success. Track release work separately if needed.
- If Jira is unavailable, report the blocker and preserve the current work.
  Do not silently claim synchronization or start a separate backlog. Resume
  normal implementation after tracking is restored, unless the user directs an
  explicit exception.
- Do not store credentials, private recordings, transcripts, family information
  or sensitive exploit artifacts in tickets or the public repository. Use
  sanitized summaries and access-controlled evidence references.
- A security ticket is not blanket authorization for intrusive or production
  testing. Record the authorized target and scope; default to local synthetic
  fixtures. Production changes and external messages retain their normal
  authorization boundaries.

## Current documentation

Use Context7 MCP for library, framework, SDK, API, CLI and cloud-service usage,
configuration, setup, migration and library-specific debugging. Start with
`resolve-library-id` using the library name and question unless an exact
`/org/project` ID was supplied, select the best authoritative match, then use
`query-docs` with the actual question. Prefer Context7 over web search for library
documentation. This does not apply to general programming, business-logic
debugging, code review, refactoring or scripts written from scratch.

## Product and interface continuity

When available on the implementation branch, read `.interface-design/system.md`
and `docs/PRODUCT-MASTER-PROMPT.md` before interface work. These product documents
are being delivered separately from this tracking-only change.
Keep the blue-to-ivory palette and adult editorial treatment. Controls use 4px
corners; the full-bleed Creation Gallery image cards are the 18px exception.
Preserve original testimony and distinguish planned experiences from working,
verified capabilities. Phases 0–2 are the first MVP; visual completeness alone
is not release readiness. See Jira KAN-174 and KAN-175 for current implementation.
