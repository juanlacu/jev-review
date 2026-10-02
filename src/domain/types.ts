// Shapes shared by both review modes and the saved dashboard report.
import type { Dimension } from "./config.ts";

export type ReviewMode = "changes" | "codebase";

export type ChangedFile = {
  path: string;
  patch: string;
};

export type SourceFile = {
  path: string;
  content: string;
};

export type Hunk = {
  id: string;
  startLine: number;
  patch: string;
};

export type EvidenceLine = {
  id: string;
  line: number;
  code: string;
};

export type Screening<File extends { path: string }> = {
  file: File;
  probabilities: Record<Dimension, number>;
};

export type Signal<File extends { path: string }> = {
  file: File;
  dimension: Dimension;
  probability: number;
};

export type Finding<File extends { path: string }> = Signal<File> & {
  line: number;
  locationConfidence: number;
  mechanism: string;
  mechanismConfidence: number;
  pattern: string;
  patternConfidence: number;
  // The exact line Jev selected, or null when it fell back to the region start.
  code: string | null;
  // Composed in code from the selected dimension, mechanism, and pattern.
  explanation: string;
  severity: number;
  severityConfidence: number;
  owner: string | null;
  ownerConfidence: number | null;
  action: "comment" | "request_changes";
};

// What a signal has already produced, so the next pass looks for a different issue.
export type ReportedIssue = {
  line: number;
  code: string | null;
  explanation: string;
};

export type FileProfile = {
  file: string;
  category: string;
  categoryConfidence: number;
  reviewPriority: number;
  reviewPriorityConfidence: number;
};

export type ReviewReport = {
  mode: ReviewMode;
  scope: string;
  dimensions: Array<{ key: Dimension; label: string; short: string }>;
  config: {
    screenThreshold: number;
    severityMax: number;
    maxFollowUps: number;
    maxProfiles: number;
  };
  screenedFiles: number;
  contextFiles: string[];
  matrix: Array<{ file: string } & Record<Dimension, number>>;
  followedSignals: number;
  profiles: FileProfile[];
  workflow: {
    screenedCells: number;
    thresholdSignals: number;
    profiledFiles: number;
    followedSignals: number;
    locatedFindings: number;
    routedFindings: number;
  };
  findings: Array<Omit<Finding<{ path: string }>, "file"> & { file: string }>;
};

// Deliberately loose so a report saved by an older version remains viewable.
export function isReviewReport(value: unknown): value is ReviewReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.scope === "string" &&
    typeof report.screenedFiles === "number" &&
    Array.isArray(report.matrix) &&
    typeof report.followedSignals === "number" &&
    Array.isArray(report.findings)
  );
}
