import { copyFile } from "node:fs/promises";

// npm excludes pnpm-lock.yaml; preserve it under an explicit archive name.
await copyFile(
  new URL("../pnpm-lock.yaml", import.meta.url),
  new URL("../release-lock.yaml", import.meta.url),
);
