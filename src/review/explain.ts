// Shared by both review modes: once a mechanism is known, pins the finding to
// one exact line and a finer defect pattern, then composes the explanation in
// code from the selected descriptions. Jev only selects; it never writes text.
import { choice, type JsonValue, TypeSafeClient } from "@typesafe-ai/sdk";
import {
  type Dimension,
  dimensionMetadata,
  mechanisms,
  MIN_LOCATION_CONFIDENCE,
  patterns,
} from "../domain/config.ts";
import type { EvidenceLine, ReportedIssue } from "../domain/types.ts";

const client = new TypeSafeClient();

export type Explanation = {
  line: number;
  code: string | null;
  pattern: string;
  patternConfidence: number;
  explanation: string;
};

export async function explainFinding(input: {
  file: string;
  dimension: Dimension;
  mechanism: string;
  selectedEvidence: JsonValue;
  candidateLines: EvidenceLine[];
  fallbackLine: number;
  alreadyReported: ReportedIssue[];
}): Promise<Explanation> {
  const beyond = beyondReported(input.alreadyReported);
  const reportedLines = new Set(input.alreadyReported.map((issue) => issue.line));
  const candidateLines = input.candidateLines.filter((entry) => !reportedLines.has(entry.line));
  const mechanismText = describe(mechanisms[input.dimension], input.mechanism);
  const patternOptions = (patterns[input.dimension] as Record<string, Record<string, string>>)[input.mechanism] ?? {
    other: mechanismText,
  };
  const lineOptions = Object.fromEntries(candidateLines.map((entry) => [entry.id, entry.code]));
  const hasLines = candidateLines.length > 0;

  const response = await client.systemOne({
    state: {
      file: input.file,
      concern: { dimension: input.dimension, mechanism: mechanismText },
      selectedEvidence: input.selectedEvidence,
      ...beyond.state,
    },
    questions: {
      pattern: choice(
        "Which pattern most precisely describes the concern in selectedEvidence" + beyond.clause + "?",
        patternOptions,
      ),
      ...(hasLines && {
        line: choice(
          {
            question: "Which single line of selectedEvidence is the most direct cause of the concern" + beyond.clause + "?",
            fallback: "Select noMatch when no single line is responsible",
          },
          { ...lineOptions, noMatch: "No single line is responsible for the concern" },
        ),
      }),
    },
  });

  const answers = response.answers as Record<string, { choice: string; confidence: number }>;
  const pattern = answers.pattern;
  const picked = answers.line;
  const exact =
    picked && picked.confidence >= MIN_LOCATION_CONFIDENCE
      ? candidateLines.find((entry) => entry.id === picked.choice)
      : undefined;

  const label = dimensionMetadata.find((entry) => entry.key === input.dimension)?.label ?? input.dimension;
  return {
    line: exact?.line ?? input.fallbackLine,
    code: exact?.code ?? null,
    pattern: pattern.choice,
    patternConfidence: pattern.confidence,
    explanation: `${label} · ${mechanismText}: ${describe(patternOptions, pattern.choice)}.`,
  };
}

// Extra state and question wording that steer a repeated judgment away from
// issues the same signal already produced. Empty on the first pass, so the
// first finding is asked exactly as before.
export function beyondReported(alreadyReported: ReportedIssue[]): {
  state: { alreadyReported?: ReportedIssue[] };
  clause: string;
} {
  if (alreadyReported.length === 0) return { state: {}, clause: "" };
  return {
    state: { alreadyReported },
    clause: ", other than the issues already listed in alreadyReported",
  };
}

function describe(options: Record<string, string>, key: string): string {
  return options[key] ?? key;
}
