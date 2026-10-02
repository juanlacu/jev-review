# Jev Review

A small code-review workflow built with [TypeSafe Jev](https://typesafe.ai). It can review a Git diff or scan a complete codebase, follows the strongest structured signals through focused model calls, and presents the result in a quiet local dashboard.

![Jev Review dashboard](docs/dashboard.png)

## How It Works

The reviewer keeps orchestration in code and uses Jev for bounded judgments:

```text
Noul risk matrix
  -> Choice + Score file profiles
  -> Choice evidence selection
  -> Choice mechanism classification
  -> Score severity
  -> conditional Choice reviewer routing
```

- Exposes separate change-review and complete-codebase entry points.
- Uses changed or related tests as context when judging test gaps.
- Reads each changed file in full, plus the diffs of changed files it imports
  or is imported by, so a change that conflicts with unchanged code or with
  another file in the same diff can be flagged.
- Screens correctness, security, reliability, compatibility, and test coverage.
- Selects concrete diff hunks or source regions before scoring impact.
- Uses structured hints, counterexamples, and explicit decision boundaries.
- Applies thresholds and workflow policy in code.
- Shows large reports in collapsible dashboard sections.
- Binds the dashboard to `127.0.0.1` and never serves environment files.

## Quick Start

Requires Node.js 24+, Git, and a [TypeSafe API key](https://console.typesafe.ai/settings/keys).

```bash
npm install
cp .env.example .env
# Add TYPESAFE_API_KEY to .env

# Review the current Git diff
npm run review:changes:save -- /path/to/git/repository

# Or scan every non-ignored source file under a scope
npm run review:codebase:save -- /path/to/git/repository-or-package
npm run dashboard
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run review:changes -- <path>` | Print a current-diff review as JSON |
| `npm run review:changes:save -- <path>` | Save a current-diff review for the dashboard |
| `npm run review:codebase -- <path>` | Print a complete codebase scan as JSON |
| `npm run review:codebase:save -- <path>` | Save a complete codebase scan for the dashboard |
| `npm run dashboard` | Start the local dashboard |
| `npm run check` | Typecheck, verify dependency flow, and syntax-check the dashboard client |

## GitHub Action

Reviews every pull request and posts the findings as one review with an inline
comment on each finding's line. Only Jev is called; GitHub is used to publish.
Findings on the same line share one comment, and a rerun on a later push skips
findings already posted on the pull request.

```yaml
# .github/workflows/jev-review.yml
name: Jev Review
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: juanlacu/jev-review@main
        with:
          typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}
```

Add `TYPESAFE_API_KEY` under the repository's Settings → Secrets and variables →
Actions. Optional inputs: `path` (review a subdirectory) and `fail-on-blocking`
(fail the job when a finding requests changes). Pull requests from forks of the
reviewed repository do not receive secrets, so the review does not run on them.

To preview a review locally without posting, stage a diff and run
`JEV_DRY_RUN=true node --env-file=.env src/cli/review-pr.ts <path>`.

## Architecture

Everything lives under `src/`, arranged in layers that only depend downward:

```text
src/
  domain/      config.ts, types.ts, patch.ts   shared policy, report shapes, diff parsing
               context.ts                      related changed files through imports
  adapters/    git.ts, repository-files.ts     change and complete-source discovery
               report-store.ts                 atomic report save/load
               github.ts                       pull request event and review posting
  review/      changes.ts, codebase.ts          mode-specific workflows
               *-judgments.ts, workflow.ts     Jev calls and shared staged orchestration
               explain.ts                      exact line, defect pattern, explanation
  cli/         review-*.ts, save-*.ts           explicit mode entry points
               review-pr.ts                    GitHub Action entry point
  dashboard/   server.ts, public/              local-only HTTP server and the plain client
```

Imports point toward lower layers only:

```text
{ cli, dashboard } -> review -> adapters -> domain
```

`scripts/check-dependencies.ts` fails `npm run check` on any upward import, any
import between `cli` and `dashboard`, or any cycle.

## Current Scope

This is an experiment in composing fast typed judgments into a review workflow. It does not yet integrate compiler diagnostics, static analyzers, repository indexing, or generated explanations. Findings are review prompts, not proof of a defect.

## License

[MIT](LICENSE)
