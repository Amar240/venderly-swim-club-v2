import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { routes } from "./routes";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

app.use(helmet());
app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
app.use(express.json({ limit: "1mb" }));

app.use(routes);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  logger.info("Swim club API listening", { port });
});
