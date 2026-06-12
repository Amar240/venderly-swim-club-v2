import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "path";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { routes } from "./routes";

export const createApp = (): express.Express => {
  const app = express();
  app.set("trust proxy", 1);

  const corsOrigin = process.env.CORS_ORIGIN ?? "*";
  const frontendDistPath = path.join(__dirname, "../frontend/dist");
  const frontendIndexPath = path.join(frontendDistPath, "index.html");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          imgSrc: ["'self'", "data:", "https://assets.cdn.filesafe.space"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "https:", "'unsafe-inline'", "https://fonts.googleapis.com"],
          upgradeInsecureRequests: []
        }
      }
    })
  );
  app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.use(routes);
  app.use(express.static(frontendDistPath));
  app.get("*", (req, res, next) => {
    const reservedPrefixes = ["/api", "/webhooks", "/auth"];

    if (reservedPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
      next();
      return;
    }

    res.sendFile(frontendIndexPath, (error) => {
      if (error) {
        next();
      }
    });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
