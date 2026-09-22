import { expect, it } from "vitest";
import { launchAgent } from "../src/service.js";
it("renders an explicit restartable service with safe path encoding", () => {
  const plist = launchAgent(
    "/path/Node & tools/node",
    "/my project/relentless/dist/cli.js",
    "/my project/relentless",
  );
  expect(plist).toContain("/path/Node &amp; tools/node");
  expect(plist).toContain("<key>KeepAlive</key><true/>");
  expect(plist).toContain("<string>goal</string><string>run</string>");
  expect(plist).not.toContain("/bin/sh");
});
