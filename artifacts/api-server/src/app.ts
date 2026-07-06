import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
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
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
const uploadsDir = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsDir));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
app.use("/api/", limiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use("/api", router);

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error(err);
  if (err.message === "Only image files are allowed")
    return res.status(400).json({ error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

export default app;
