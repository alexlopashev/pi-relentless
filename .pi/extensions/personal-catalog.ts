import {
  ModelRuntime,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  personalCatalog,
  personalProvider,
} from "../../src/personal-catalog.js";
export default async function (pi: ExtensionAPI): Promise<void> {
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
  });
  pi.registerProvider(personalProvider, personalCatalog(runtime));
}
