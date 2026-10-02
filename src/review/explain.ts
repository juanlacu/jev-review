// Shared by both review modes: once a mechanism is known, pins the finding to
// one exact line and a finer defect pattern, then composes the explanation in
// code from the selected descriptions. Jev only selects; it never writes text.
import { choice, type JsonValue, TypeSafeClient } from "@typesafe-ai/sdk";
import {
  type Dimension,
  dimensionMetadata,
  mechanisms,
  MAX_NO_MATCH_PROBABILITY,
  MAX_REPEAT_NO_MATCH_PROBABILITY,
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
  // Change review passes the file's full source and related changes.
  context?: JsonValue;
}): Promise<Explanation> {
  const beyond = beyondReported(input.alreadyReported);
  const reportedLines = new Set(input.alreadyReported.map((issue) => issue.line));
  const candidateLines = input.candidateLines.filter((entry) => !reportedLines.has(entry.line));
  const mechanismText = describe(mechanisms[input.dimension], input.mechanism);
  const patternOptions = (patterns[input.dimension] as Record<string, Record<string, string>>)[input.mechanism] ?? {
    other: mechanismText,
  };
  const lineOptions = Object.fromEntries(
    candidateLines.map((entry) => [entry.id, entry.changed ? entry.code : `(unchanged) ${entry.code}`]),
  );
  const hasLines = candidateLines.length > 0;

  const response = await client.systemOne({
    state: {
      file: input.file,
      concern: { dimension: input.dimension, mechanism: mechanismText },
      selectedEvidence: input.selectedEvidence,
      ...(input.context !== undefined && { context: input.context }),
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

  const answers = response.answers as Record<string, ChoiceAnswer>;
  const pattern = answers.pattern;
  const picked = answers.line && pickCandidate(answers.line, "noMatch", input.alreadyReported.length > 0);
  const exact = picked ? candidateLines.find((entry) => entry.id === picked.choice) : undefined;

  const label = dimensionMetadata.find((entry) => entry.key === input.dimension)?.label ?? input.dimension;
  return {
    line: exact?.line ?? input.fallbackLine,
    code: exact?.code ?? null,
    pattern: pattern.choice,
    patternConfidence: pattern.confidence,
    explanation: `${label} · ${mechanismText}: ${describe(patternOptions, pattern.choice)}.`,
  };
}

type ChoiceAnswer = {
  choice: string;
  confidence: number;
  probabilities: Readonly<Record<string, number>>;
};

// Picks the most likely candidate unless the "none" option is likely. Gating on
// the choice's confidence would drop real evidence whenever several candidates
// share the probability, such as two hunks that both show the concern.
export function pickCandidate(
  answer: ChoiceAnswer,
  none: string,
  repeat = false,
): { choice: string; probability: number } | null {
  const limit = repeat ? MAX_REPEAT_NO_MATCH_PROBABILITY : MAX_NO_MATCH_PROBABILITY;
  if ((answer.probabilities[none] ?? 0) >= limit) return null;
  const [choice, probability] = Object.entries(answer.probabilities)
    .filter(([label]) => label !== none)
    .reduce((best, entry) => (entry[1] > best[1] ? entry : best), ["", -1]);
  return choice ? { choice, probability } : null;
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
