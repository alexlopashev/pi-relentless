import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerRelentless } from "../../src/pi-extension.js";
import { registerRelentlessInventory } from "../../src/pi-inventory-tool.js";
import { registerRelentlessConfigTool } from "../../src/pi-config-tool.js";
export default function (pi: ExtensionAPI): void {
  registerRelentless(pi);
  registerRelentlessInventory(pi);
  registerRelentlessConfigTool(pi);
}
