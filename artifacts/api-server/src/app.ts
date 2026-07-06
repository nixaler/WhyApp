import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1); // Replit proxy sets X-Forwarded-For
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files — must match URL prefix returned by routes (/api/uploads/...)
const uploadsDir = path.join(process.cwd(), "uploads");
app.use("/api/uploads", express.static(uploadsDir));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
app.use("/api/", limiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use("/api", router);

// Serve the built why-app frontend when it's been built alongside this service
// (single-service deployments, e.g. Railway). In Replit, the frontend is its
// own artifact/preview and this directory won't exist here, so this is a no-op.
const frontendDist = path.join(process.cwd(), "..", "why-app", "dist", "public");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error(err);
  if (err.message === "Only image files are allowed")
    return res.status(400).json({ error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

export default app;
