import { createHash } from "node:crypto";
import { CodingEditError } from "./coding-output-reason.js";

interface LegacyEdit {
  path: string;
  content: string;
}
interface Replacement {
  oldText: string;
  newText: string;
}
interface TargetedEdit {
  path: string;
  baseSha256: string;
  replacements: Replacement[];
}

type Edit = LegacyEdit | TargetedEdit;

const encoder = new TextEncoder();
const bytes = (value: string): number => encoder.encode(value).byteLength;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => key in value);
const validText = (value: unknown, allowEmpty: boolean): value is string =>
  typeof value === "string" &&
  (allowEmpty || value.length > 0) &&
  !value.includes("\0") &&
  bytes(value) <= 32768;
const validPath = (path: string): boolean =>
  path.length <= 240 &&
  path.split("/").every((part) => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part));

export function parseCodingEdits(
  output: string,
  writable: ReadonlySet<string>,
  files?: ReadonlyMap<string, string>,
): { path: string; content: string }[] {
  if (output.includes("\0") || bytes(output) > 65536)
    throw new CodingEditError("invalid_reply", "Invalid reply");
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    throw new CodingEditError("invalid_json", "Invalid JSON");
  }
  if (
    !isObject(parsed) ||
    !keysAre(parsed, ["edits"]) ||
    !Array.isArray(parsed["edits"]) ||
    parsed["edits"].length < 1 ||
    parsed["edits"].length > 20
  ) {
    throw new CodingEditError("invalid_edits", "Invalid edits");
  }

  const seen = new Set<string>();
  const edits: Edit[] = [];
  const items: unknown[] = parsed["edits"];
  for (const item of items) {
    if (
      !isObject(item) ||
      typeof item["path"] !== "string" ||
      !validPath(item["path"]) ||
      !writable.has(item["path"]) ||
      seen.has(item["path"])
    )
      throw new CodingEditError("invalid_path", "Invalid path");
    seen.add(item["path"]);
    if (files !== undefined && !files.has(item["path"]))
      throw new CodingEditError("missing_file", "Missing file");
    if (
      "content" in item &&
      keysAre(item, ["path", "content"]) &&
      validText(item["content"], true)
    ) {
      edits.push({ path: item["path"], content: item["content"] });
      continue;
    }
    if (
      keysAre(item, ["path", "baseSha256", "replacements"]) &&
      typeof item["baseSha256"] === "string" &&
      /^[0-9a-f]{64}$/.test(item["baseSha256"]) &&
      Array.isArray(item["replacements"]) &&
      item["replacements"].length >= 1 &&
      item["replacements"].length <= 50
    ) {
      const replacements: Replacement[] = [];
      const values: unknown[] = item["replacements"];
      for (const replacement of values) {
        if (
          !isObject(replacement) ||
          !keysAre(replacement, ["oldText", "newText"]) ||
          !validText(replacement["oldText"], false) ||
          !validText(replacement["newText"], true)
        )
          throw new CodingEditError(
            "invalid_replacement",
            "Invalid replacement",
          );
        replacements.push({
          oldText: replacement["oldText"],
          newText: replacement["newText"],
        });
      }
      edits.push({
        path: item["path"],
        baseSha256: item["baseSha256"],
        replacements,
      });
      continue;
    }
    throw new CodingEditError("invalid_edit", "Invalid edit");
  }

  const result: { path: string; content: string }[] = [];
  for (const edit of edits) {
    if ("content" in edit) {
      result.push({ path: edit.path, content: edit.content });
      continue;
    }
    if (files === undefined)
      throw new CodingEditError("snapshot_required", "Snapshot required");
    const original = files.get(edit.path);
    if (
      original === undefined ||
      createHash("sha256").update(original, "utf8").digest("hex") !==
        edit.baseSha256
    )
      throw new CodingEditError("hash_mismatch", "Hash mismatch");
    const ranges: { start: number; end: number; replacement: string }[] = [];
    for (const replacement of edit.replacements) {
      let found = -1;
      let count = 0;
      for (
        let index = original.indexOf(replacement.oldText);
        index >= 0;
        index = original.indexOf(replacement.oldText, index + 1)
      ) {
        found = index;
        count++;
      }
      if (count !== 1)
        throw new CodingEditError(
          "text_occurrence",
          "Text occurrence mismatch",
        );
      ranges.push({
        start: found,
        end: found + replacement.oldText.length,
        replacement: replacement.newText,
      });
    }
    ranges.sort((a, b) => a.start - b.start);
    let end = -1;
    for (const range of ranges) {
      if (range.start < end)
        throw new CodingEditError(
          "overlapping_replacements",
          "Overlapping replacements",
        );
      end = range.end;
    }
    let content = original;
    for (const range of ranges.reverse()) {
      content =
        content.slice(0, range.start) +
        range.replacement +
        content.slice(range.end);
    }
    result.push({ path: edit.path, content });
  }

  let total = 0;
  if (files !== undefined) {
    const changed = new Map(result.map((edit) => [edit.path, edit.content]));
    for (const [path, content] of files)
      total += bytes(changed.get(path) ?? content);
  } else {
    for (const edit of result) total += bytes(edit.content);
  }
  if (total > 131072)
    throw new CodingEditError("aggregate_size", "Aggregate size exceeded");
  for (const edit of result)
    if (edit.content.includes("\0") || bytes(edit.content) > 32768)
      throw new CodingEditError("file_size", "File size exceeded");
  return result;
}

export const codingEditInstructions =
  'Return ONLY JSON {"edits":[...]}. For small changes use {"path":"...","baseSha256":"the file sha256 supplied below","replacements":[{"oldText":"unique exact text from the original file","newText":"replacement text"}]}. All oldText spans must be unique, nonempty, disjoint and taken from the same original snapshot; no sequential edits to inserted text. For full replacement use {"path":"...","content":"complete replacement text"}. Do not mix forms or repeat a file path. Edit only declared writable paths. Files marked create:true are explicitly authorized new files, represented by empty text in this private workspace; use complete-file content for them. No commands, undeclared new files, or deletions.';
