import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { localCatalog } from "../../src/local-provider.js";
export default function (pi: ExtensionAPI): void {
  pi.registerProvider("clanker-local", localCatalog());
}
