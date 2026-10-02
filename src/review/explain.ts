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
import type { EvidenceLine } from "../domain/types.ts";

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
}): Promise<Explanation> {
  const mechanismText = describe(mechanisms[input.dimension], input.mechanism);
  const patternOptions = (patterns[input.dimension] as Record<string, Record<string, string>>)[input.mechanism] ?? {
    other: mechanismText,
  };
  const lineOptions = Object.fromEntries(input.candidateLines.map((entry) => [entry.id, entry.code]));
  const hasLines = input.candidateLines.length > 0;

  const response = await client.systemOne({
    state: {
      file: input.file,
      concern: { dimension: input.dimension, mechanism: mechanismText },
      selectedEvidence: input.selectedEvidence,
    },
    questions: {
      pattern: choice(
        "Which pattern most precisely describes the concern in selectedEvidence?",
        patternOptions,
      ),
      ...(hasLines && {
        line: choice(
          {
            question: "Which single line of selectedEvidence is the most direct cause of the concern?",
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
      ? input.candidateLines.find((entry) => entry.id === picked.choice)
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

function describe(options: Record<string, string>, key: string): string {
  return options[key] ?? key;
}
