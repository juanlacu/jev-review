// GitHub Action entry point: reviews the staged pull request diff and posts
// the findings as one review with inline comments. The action stages the PR
// beforehand by soft-resetting to the base commit.
//
//   GITHUB_TOKEN, GITHUB_EVENT_PATH   provided by the action
//   JEV_FAIL_ON_BLOCKING=true         exit 1 when a finding requests changes
//   JEV_DRY_RUN=true                  print the review instead of posting it
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GitHubError,
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
summarize(summaryMarkdown(report));

if (report.findings.length > 0) {
  const review = {
    body: `${MARKER}\n${reviewHeadline(report)}`,
    comments: report.findings.map(
      (finding): ReviewComment => ({ path: finding.file, line: finding.line, body: commentBody(finding) }),
    ),
  };

  if (dryRun) {
    console.log(JSON.stringify(review, null, 2));
  } else {
    const token = required("GITHUB_TOKEN");
    const pr = pullRequestFromEvent(required("GITHUB_EVENT_PATH"));
    try {
      console.error("posted " + (await postReview(token, pr, review)));
    } catch (error) {
      // 422 means a line is outside GitHub's view of the diff; keep the
      // findings by moving them into the review body instead of dropping them.
      if (!(error instanceof GitHubError && error.status === 422)) throw error;
      console.error("inline comments rejected; posting findings in the review body");
      const body = [review.body, ...report.findings.map((finding) => `---\n**\`${finding.file}:${finding.line}\`**\n\n${commentBody(finding)}`)].join("\n\n");
      console.error("posted " + (await postReview(token, pr, { body, comments: [] })));
    }
  }
}

if (blocking.length > 0 && process.env.JEV_FAIL_ON_BLOCKING === "true") {
  console.error(blocking.length + " blocking finding(s)");
  process.exit(1);
}

function commentBody(finding: ReportFinding): string {
  const lines = [`**Jev Review** · ${finding.explanation ?? `${finding.dimension} · ${finding.mechanism}`}`];
  if (finding.code) lines.push("", "```", finding.code, "```");
  const details = [
    `severity ${finding.severity.toFixed(1)} / ${SEVERITY_MAX}`,
    `screening ${finding.probability.toFixed(2)}`,
    finding.owner && `suggested reviewer: ${finding.owner}`,
  ].filter(Boolean);
  lines.push("", `<sub>${finding.action === "request_changes" ? "⚠️ Request changes · " : ""}${details.join(" · ")}</sub>`);
  return lines.join("\n");
}

function reviewHeadline(report: ReviewReport): string {
  const count = report.findings.length;
  return `**Jev Review** found ${count} ${count === 1 ? "finding" : "findings"} in ${report.screenedFiles} changed source ${report.screenedFiles === 1 ? "file" : "files"}. Findings are review leads, not proof of a defect.`;
}

function summaryMarkdown(report: ReviewReport): string {
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
    reviewHeadline(report),
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
