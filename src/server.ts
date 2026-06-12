import "dotenv/config";
import { createApp } from "./app";
import { logger } from "./lib/logger";

const app = createApp();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

app.listen(port, () => {
  logger.info("Swim club API listening", { port });
});
