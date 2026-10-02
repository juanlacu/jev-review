import { changedFiles } from "../adapters/git.ts";
import { TEST_FILE } from "../domain/config.ts";
import type { ChangedFile, ReviewReport } from "../domain/types.ts";
import { locateSignal, profileFile, screenFile } from "./judgments.ts";
import { type Log, runReview } from "./workflow.ts";

export function runChangeReview(scope: string, log: Log): Promise<ReviewReport> {
  return runReview(scope, log, {
    mode: "changes",
    subject: "changed source",
    context: "changed test",
    discover,
    screen: screenFile,
    profile: profileFile,
    locate: locateSignal,
  });
}

// True when the diff under scope has at least one non-test source file.
export function hasReviewableChanges(scope: string): boolean {
  return discover(scope).files.length > 0;
}

function discover(scope: string): { files: ChangedFile[]; contextFiles: ChangedFile[] } {
  const changed = changedFiles(scope);
  return {
    files: changed.filter((file) => !TEST_FILE.test(file.path)),
    contextFiles: changed.filter((file) => TEST_FILE.test(file.path)),
  };
}
