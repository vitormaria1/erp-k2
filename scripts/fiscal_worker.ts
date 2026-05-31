import "dotenv/config";

import { setTimeout as sleep } from "node:timers/promises";

import { processNextFiscalJob } from "../src/fiscal/worker/processor";

async function main() {
  console.log("Fiscal worker started");

  // Simple long-running loop (deploy as separate process).
  while (true) {
    const res = await processNextFiscalJob();
    if (!res.handled) {
      await sleep(1000);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
