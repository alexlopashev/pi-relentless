import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default async function (pi: ExtensionAPI): Promise<void> {
  const { registerRelentless } = await import("../../src/pi-extension.js");
  const { registerRelentlessInventory } =
    await import("../../src/pi-inventory-tool.js");
  const { registerRelentlessConfigTool } =
    await import("../../src/pi-config-tool.js");
  registerRelentless(pi);
  registerRelentlessInventory(pi);
  registerRelentlessConfigTool(pi);
}
