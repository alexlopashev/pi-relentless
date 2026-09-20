import { executeJob } from "./worker-job.js";
const shutdown = new AbortController();
let executing = false;
process.on("disconnect", () => {
  if (executing) shutdown.abort();
  else process.exit(1);
});
process.on("SIGTERM", () => {
  if (executing) shutdown.abort();
  else process.exit(1);
});
process.once("message", (input: unknown) => {
  executing = true;
  void executeJob(input, shutdown.signal).then((reply) => {
    if (!process.connected || !process.send) {
      process.exit(1);
    }
    process.send(reply, () => {
      process.exit(0);
    });
  });
});
