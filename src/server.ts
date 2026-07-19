import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

import { createApp } from "./app";
import { startAutoSignoutJob } from "./lib/autoSignout";
import { startEmailDigestJob } from "./lib/emailDigest";
import { startWebhookCleanupJob } from "./lib/webhookCleanup";
import { startDemoCleanupJob } from "./lib/demoCleanup";
import { logger } from "./lib/logger";

const app = createApp();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

app.listen(port, () => {
  const appMode = process.env.APP_MODE ?? "full";
  logger.info("Swim club API listening", { port, appMode });

  if (appMode === "demo") {
    startDemoCleanupJob();
    return;
  }

  startAutoSignoutJob();
  startEmailDigestJob();
  startWebhookCleanupJob();
});
