import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { metaCatalog, metaProvider } from "../../src/meta-provider.js";
export default function (pi: ExtensionAPI): void {
  pi.registerProvider(metaProvider, metaCatalog());
}
