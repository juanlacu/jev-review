// GitHub Action entry point: reviews the staged pull request diff and posts
// the findings as one review with inline comments. The action stages the PR
// beforehand by soft-resetting to the base commit.
//
// Findings on the same line share one comment, and each finding carries a
// hidden key so a rerun on a later push skips what is already on the PR.
//
//   GITHUB_TOKEN, GITHUB_EVENT_PATH   provided by the action
//   JEV_FAIL_ON_BLOCKING=true         exit 1 when a finding requests changes
//   JEV_DRY_RUN=true                  print the review instead of posting it
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GitHubError,
  postedReviewText,
  postReview,
  pullRequestFromEvent,
  type ReviewComment,
} from "../adapters/github.ts";
import { saveReport } from "../adapters/report-store.ts";
import { SEVERITY_MAX } from "../domain/config.ts";
import type { ReviewReport } from "../domain/types.ts";
import { hasReviewableChanges, runChangeReview } from "../review/changes.ts";

type ReportFinding = ReviewReport["findings"][number];

const MARKER = "<!-- jev-review -->";
const scope = resolve(process.argv[2] ?? ".");
const dryRun = process.env.JEV_DRY_RUN === "true";

if (!hasReviewableChanges(scope)) {
  summarize("Jev Review: no changed JavaScript or TypeScript source files to review.");
  console.error("no reviewable changes; skipping");
  process.exit(0);
}

const report = await runChangeReview(scope, console.error);
if (process.env.REVIEW_FILE) await saveReport(report, resolve(process.env.REVIEW_FILE));

const blocking = report.findings.filter((finding) => finding.action === "request_changes");
const pr = dryRun ? null : pullRequestFromEvent(required("GITHUB_EVENT_PATH"));
const token = dryRun ? "" : required("GITHUB_TOKEN");

const posted = pr ? (await postedReviewText(token, pr)).join("\n") : "";
const fresh = report.findings.filter((finding) => !posted.includes(findingMarker(finding)));
const repeated = report.findings.length - fresh.length;
summarize(summaryMarkdown(report, repeated));

if (fresh.length === 0) {
  if (report.findings.length > 0) console.error("all " + repeated + " finding(s) already posted; skipping");
} else {
  const groups = groupByLine(fresh);
  const review = {
    body: `${MARKER}\n${reviewHeadline(report, fresh.length, repeated)}`,
    comments: groups.map(
      (group): ReviewComment => ({ path: group[0].file, line: group[0].line, body: commentBody(group) }),
    ),
  };

  if (!pr) {
    console.log(JSON.stringify(review, null, 2));
  } else {
    try {
      console.error("posted " + (await postReview(token, pr, review)));
    } catch (error) {
      // 422 means a line is outside GitHub's view of the diff; keep the
      // findings by moving them into the review body instead of dropping them.
      if (!(error instanceof GitHubError && error.status === 422)) throw error;
      console.error("inline comments rejected; posting findings in the review body");
      const body = [
        review.body,
        ...groups.map((group) => `---\n**\`${group[0].file}:${group[0].line}\`**\n\n${commentBody(group)}`),
      ].join("\n\n");
      console.error("posted " + (await postReview(token, pr, { body, comments: [] })));
    }
  }
}

if (blocking.length > 0 && process.env.JEV_FAIL_ON_BLOCKING === "true") {
  console.error(blocking.length + " blocking finding(s)");
  process.exit(1);
}

// Keyed on the quoted code rather than the line number, so a finding is still
// recognized after unrelated edits above it shift its line. The pattern is left
// out because Jev's pick can vary between runs for the same issue.
function findingMarker(finding: ReportFinding): string {
  const anchor = finding.code ?? `line ${finding.line}`;
  const key = [finding.file, finding.dimension, anchor].join("\n");
  return `<!-- jev-review:finding:${createHash("sha256").update(key).digest("hex").slice(0, 16)} -->`;
}

function groupByLine(findings: ReportFinding[]): ReportFinding[][] {
  const groups = new Map<string, ReportFinding[]>();
  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}`;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return [...groups.values()];
}

function commentBody(group: ReportFinding[]): string {
  const [first] = group;
  const text = (finding: ReportFinding) => finding.explanation ?? `${finding.dimension} · ${finding.mechanism}`;
  const lines =
    group.length === 1
      ? [`**Jev Review** · ${text(first)}`]
      : [
          `**Jev Review** · ${group.length} issues on this line`,
          "",
          ...group.map((finding) => `- ${text(finding)} (severity ${finding.severity.toFixed(1)})`),
        ];
  if (first.code) lines.push("", "```", first.code, "```");

  const severity = Math.max(...group.map((finding) => finding.severity));
  const owners = [...new Set(group.map((finding) => finding.owner).filter(Boolean))];
  const details = [
    `${group.length === 1 ? "severity" : "max severity"} ${severity.toFixed(1)} / ${SEVERITY_MAX}`,
    group.length === 1 && `screening ${first.probability.toFixed(2)}`,
    owners.length > 0 && `suggested reviewer: ${owners.join(", ")}`,
  ].filter(Boolean);
  const blocks = group.some((finding) => finding.action === "request_changes");
  lines.push("", `<sub>${blocks ? "⚠️ Request changes · " : ""}${details.join(" · ")}</sub>`);
  lines.push(...group.map(findingMarker));
  return lines.join("\n");
}

function reviewHeadline(report: ReviewReport, fresh: number, repeated: number): string {
  const files = `${report.screenedFiles} changed source ${report.screenedFiles === 1 ? "file" : "files"}`;
  const found = `${fresh} ${repeated > 0 ? "new " : ""}${fresh === 1 ? "finding" : "findings"}`;
  const earlier = repeated > 0 ? ` (${repeated} reported earlier ${repeated === 1 ? "is" : "are"} not repeated)` : "";
  return `**Jev Review** found ${found} in ${files}${earlier}. Findings are review leads, not proof of a defect.`;
}

function summaryMarkdown(report: ReviewReport, repeated: number): string {
  if (report.findings.length === 0) {
    return `### Jev Review\n\nNo supported findings in ${report.screenedFiles} changed source files (${report.followedSignals} signals followed).`;
  }
  const rows = report.findings.map(
    (finding) =>
      `| \`${finding.file}:${finding.line}\` | ${finding.explanation ?? finding.mechanism} | ${finding.severity.toFixed(1)} | ${finding.action} |`,
  );
  return [
    "### Jev Review",
    "",
    `${report.findings.length} findings in ${report.screenedFiles} changed source files; ${repeated} already posted on this pull request.`,
    "",
    "| Location | Finding | Severity | Action |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function summarize(markdown: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + " is required");
  return value;
}
