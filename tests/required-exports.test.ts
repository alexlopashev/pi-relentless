import { expect, test } from "vitest";
import { missingExports } from "../src/required-exports.js";

test("rejects placeholder code and ignores comments, strings, and type-only exports", () => {
  expect(
    missingExports(
      "// export class CodingJournal {}\nconst text = 'export const useful = 1';",
      ["CodingJournal", "useful"],
    ),
  ).toEqual(["CodingJournal", "useful"]);
  expect(
    missingExports("export interface Contract {}\nexport type Name = string;", [
      "Contract",
      "Name",
    ]),
  ).toEqual(["Contract", "Name"]);
});
test("recognizes explicit runtime export declarations and aliases", () => {
  const source =
    "export class CodingJournal {}\nexport async function run() {}\nexport const {value: renamed} = {value:1};\nconst internal = 1; export {internal as publicName}; export default 3;";
  expect(
    missingExports(source, [
      "CodingJournal",
      "run",
      "renamed",
      "publicName",
      "default",
    ]),
  ).toEqual([]);
  expect(missingExports(source, ["internal"])).toEqual(["internal"]);
});
test("does not infer wildcard exports or count type-only reexports", () => {
  expect(
    missingExports(
      "export * from './x'; export type { Hidden } from './x'; export { type Other, visible } from './x';",
      ["Hidden", "Other", "unknown", "visible"],
    ),
  ).toEqual(["Hidden", "Other", "unknown"]);
});

test("ambient declarations disappear while enums and namespaces retain runtime exports", () => {
  expect(
    missingExports(
      "export declare class Ghost {}\nexport declare const phantom: string;",
      ["Ghost", "phantom"],
    ),
  ).toEqual(["Ghost", "phantom"]);
  expect(
    missingExports(
      "export enum Mode { A }\nexport namespace Values { export const n = 1; }",
      ["Mode", "Values"],
    ),
  ).toEqual([]);
});
