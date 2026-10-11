# Jira workflow

The shared **Edit Request** Jira space (`KAN`) is the source of truth for
Remember When work and its current status. Always use the `remember-when` label
and prefix issue titles with `Remember When:` to distinguish this project.
Repository documents retain architecture, requirements and dated evidence;
Jira owns the actionable backlog, decisions, priority and completion status.

- [Board](https://scottsworkspace-43475593.atlassian.net/jira/software/projects/KAN/boards/1)
- [All issues](https://scottsworkspace-43475593.atlassian.net/issues/?jql=project%20%3D%20KAN%20AND%20labels%20%3D%20%22remember-when%22%20ORDER%20BY%20created%20DESC)
- [Setup record KAN-21](https://scottsworkspace-43475593.atlassian.net/browse/KAN-21)
- Canonical repository: https://github.com/ScottinDC/remember-when
- Jira site: `scottsworkspace-43475593.atlassian.net`; project ID: `10000`; key: `KAN`; board ID: `1`.

## Workstreams

| Workstream | Epic | Required label | Typical issue type |
| --- | --- | --- | --- |
| Feature requests | [KAN-6](https://scottsworkspace-43475593.atlassian.net/browse/KAN-6) | `feature` | Story or Feature |
| Housekeeping | [KAN-3](https://scottsworkspace-43475593.atlassian.net/browse/KAN-3) | `housekeeping` | Task |
| QA and release readiness | [KAN-4](https://scottsworkspace-43475593.atlassian.net/browse/KAN-4) | `qa` | Task or Bug |
| Pen testing and security | [KAN-5](https://scottsworkspace-43475593.atlassian.net/browse/KAN-5) | `pentest` | Task or Bug |

Use `remember-when` on every issue and at least one workstream label. Attach
standard issues to their workstream epic; use subtasks for smaller steps. Bugs
found by QA or security stay linked to their originating test/assessment issue.
Feature candidates imported from the briefs use `backlog-proposal`; their
presence does not commit to implementation or a delivery date.

## Intake through completion

1. Search `project = KAN AND labels = "remember-when"` for an existing issue. Read its scope and latest evidence.
2. Create or refine a ticket with the problem, source, scope, acceptance criteria,
   verification plan and any dependencies. Assign an owner when work is accepted;
   do not invent deadlines or severity.
3. Move To Do → In Progress when implementation or investigation starts. Include
   the `KAN-N` key in new branches, commits and PR titles and link the PR from Jira.
4. Add concise progress comments for material findings and decisions. For a
   blocker, add the `blocked` label and state what must change and who can resolve
   it. Remove the label when resolved. Do not mark blocked work Done.
5. Move to In Review for implementation review and outstanding QA. Record dated
   results with the exact environment and commit/patch. Put newly discovered
   work in linked issues with independent acceptance criteria.
6. Move to Done only after the defined scope is verified. If deployment is a
   separate step, explicitly link its open release ticket. Never infer production
   success from local checks, a preview, or a merged PR.

These four statuses were read from the live project on October 7, 2026. Fetch
available transitions for the particular issue at execution time; IDs can change.

## Issue and evidence template

```text
Problem / user outcome:
Source and date:
Scope and environment:
Acceptance criteria:
Verification plan:
Dependencies / blocker:
Implementation: branch, commit, PR
Results: date, exact target, commands or steps, expected and actual behavior
Evidence: sanitized artifact references
Remaining limits / release follow-up:
```

For security assessments add authorized targets, test accounts, exclusions,
impact/severity rationale, sanitized reproduction, remediation and retest/negative
controls. Default to isolated fixtures. Keep private audio, transcripts, tokens
and sensitive exploit details in access-controlled storage. The Jira project uses
the standard team-managed access configuration; restricted finding visibility
has not been configured. Do not treat it as a private evidence vault.

## Composio connection

Setup verified reads and writes through hosted Composio on October 7, 2026.
The active account used was `jira_typp-graves`, currently aliased `Bundled Jira`;
it reaches the supplied Jira site, including `KAN`. The alias is not a project
binding. No new credentials were saved in this repository.

Discover Jira tools through Composio, inspect their schemas and explicitly select
the active account. Verify site, project, issue types and required fields before
writes. Paginate searches fully when reconciling the backlog. Read back created
issues and changes; after an uncertain write, inspect the destination before
retrying. Do not duplicate writes across hosted and CLI connections.

The local Composio CLI was absent during setup. Hosted Composio handles the
workflow without an application dependency. There is no unattended Jira sync,
webhook service or scheduled testing job installed by this setup. Agents update
Jira during their work; the app itself does not need Jira credentials.

## Initial migration and delivery boundary

The initial setup created four epics and fifteen child issues. Sources were
`NARRATIVE-OPTIONS.md`, `ARCHIVE-READINESS.md`, the QA investigation, README and the
existing local security patch. Completed historical checks were retained as
dated context rather than imported as newly completed tests.

The feature proposals are KAN-8 through KAN-13. Operational follow-up is KAN-14
through KAN-20 and KAN-22, including the current regression pass (KAN-19), scoped
penetration test (KAN-18) and pending security remediation verification (KAN-22).

The tickets were initially created in a separate `RW` space, then moved to Edit
Request at the owner's direction on October 7, 2026. Their numeric issue IDs and
history were preserved and epic links restored. The unused `RW` project remains;
it is not the tracking destination. Do not create new work there.

Repository workflow files are prepared locally under KAN-21. Their publication
and review are tracked in [KAN-16](https://scottsworkspace-43475593.atlassian.net/browse/KAN-16).
The PR template and GitHub issue contact link take effect on GitHub after they
reach the repository's default branch. Required merge checks, branch protection
and native GitHub/Jira development synchronization are not configured by these
files. Keep Jira updates explicit until those mechanisms are separately verified.

## Useful queries

```jql
project = KAN AND labels = "remember-when" AND statusCategory != Done ORDER BY updated DESC
project = KAN AND labels = "remember-when" AND labels = feature AND issuetype != Epic
project = KAN AND labels = "remember-when" AND labels = housekeeping AND issuetype != Epic
project = KAN AND labels = "remember-when" AND labels = qa AND issuetype != Epic
project = KAN AND labels = "remember-when" AND labels = pentest AND issuetype != Epic
project = KAN AND labels = "remember-when" AND labels = blocked
```

## Repository enforcement audit — October 11, 2026

GitHub returned no repository rulesets and reports `main` as unprotected.
No required merge checks were enabled by this documentation change.
The available repository API did not verify a native Jira development connection;
continue explicit issue/PR linking. Consider required checks and Jira integration
as separate configuration decisions after the current PRs are reviewed.
