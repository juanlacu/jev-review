// Cross-file context for change review: which other changed files a file is
// connected to through imports. Deterministic; no model calls.
import { basename, dirname } from "node:path";
import {
  MAX_CONTEXT_CHARS,
  MAX_RELATED_CHANGES,
  MAX_RELATED_PATCH_CHARS,
} from "./config.ts";
import type { ChangedFile } from "./types.ts";

const SPECIFIER = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// Fills each file's related changes: changed files it imports or that import
// it. Imports are matched by module name, which also covers path aliases such
// as "@/lib/orders" without resolving them.
export function withRelatedChanges(files: ChangedFile[]): ChangedFile[] {
  const imports = new Map(files.map((file) => [file.path, importedModules(file.content)]));
  return files.map((file) => ({
    ...file,
    content: truncate(file.content, MAX_CONTEXT_CHARS),
    related: files
      .filter(
        (other) =>
          other.path !== file.path &&
          (imports.get(file.path)!.has(moduleName(other.path)) ||
            imports.get(other.path)!.has(moduleName(file.path))),
      )
      .slice(0, MAX_RELATED_CHANGES)
      .map((other) => ({ path: other.path, patch: truncate(other.patch, MAX_RELATED_PATCH_CHARS) })),
  }));
}

function importedModules(content: string): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) names.add(moduleName(specifier));
  }
  return names;
}

// "lib/orders.ts" and "@/lib/orders" both name "orders"; an index file is
// named after its directory, the way it is imported.
function moduleName(path: string): string {
  const name = basename(path).replace(/\.[cm]?[jt]sx?$/, "");
  return name === "index" ? basename(dirname(path)) : name;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit) + "\n… (truncated)";
}
