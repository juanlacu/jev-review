// Unified-diff helpers shared by the Git adapter and the review workflow.
import type { EvidenceLine, Hunk } from "./types.ts";

const UNTRACKED_CHUNK_LINES = 80;

// Splits a unified diff into hunks, tracking the new-file start line of each.
export function parseHunks(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: string[] | null = null;
  let startLine = 1;

  const flush = () => {
    if (current) {
      hunks.push({
        id: `hunk_${hunks.length + 1}`,
        startLine,
        patch: current.join("\n"),
      });
    }
  };

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@ ")) {
      flush();
      const match = line.match(/\+(\d+)/);
      startLine = match ? Number(match[1]) : 1;
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }

  flush();
  return hunks;
}

// Renders a brand-new file as an all-additions diff, chunked so that hunk
// selection still points at a specific region of the file.
export function patchForNewFile(source: string): string {
  const lines = source.split("\n");
  const chunkCount = Math.ceil(lines.length / UNTRACKED_CHUNK_LINES);

  return Array.from({ length: chunkCount }, (_, index) => {
    const start = index * UNTRACKED_CHUNK_LINES;
    const chunk = lines.slice(start, start + UNTRACKED_CHUNK_LINES);
    return [
      `@@ -0,0 +${start + 1},${chunk.length} @@`,
      ...chunk.map((line) => `+${line}`),
    ].join("\n");
  }).join("\n");
}

const MAX_EVIDENCE_LINE_CHARS = 200;

// Numbers the added lines of a hunk with their new-file line numbers, so a
// judgment can point at one exact line instead of the hunk start.
export function addedLines(hunk: Hunk): EvidenceLine[] {
  const result: EvidenceLine[] = [];
  let line = hunk.startLine;
  for (const text of hunk.patch.split("\n").slice(1)) {
    if (text.startsWith("-") || text.startsWith("\\")) continue;
    if (text.startsWith("+")) result.push(evidenceLine(line, text.slice(1)));
    line += 1;
  }
  return result.filter((entry) => entry.code.length > 0);
}

// Numbers the lines of a complete source region starting at startLine.
export function regionLines(startLine: number, content: string): EvidenceLine[] {
  return content
    .split("\n")
    .map((text, index) => evidenceLine(startLine + index, text))
    .filter((entry) => entry.code.length > 0);
}

function evidenceLine(line: number, text: string): EvidenceLine {
  return { id: `L${line}`, line, code: text.trim().slice(0, MAX_EVIDENCE_LINE_CHARS) };
}
