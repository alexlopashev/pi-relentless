import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerClanker } from "../../src/pi-extension.js";
import { registerClankerInventory } from "../../src/pi-inventory-tool.js";
import { registerClankerConfigTool } from "../../src/pi-config-tool.js";
export default function (pi: ExtensionAPI): void {
  registerClanker(pi);
  registerClankerInventory(pi);
  registerClankerConfigTool(pi);
}
