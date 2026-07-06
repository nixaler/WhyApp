import http from "http";
import { Server as SocketIO } from "socket.io";
import app from "./app";
import { setupChat } from "./socket/chat";
import { logger } from "./lib/logger";

// Fail fast on missing required secrets
if (!process.env["JWT_SECRET"]) {
  throw new Error("JWT_SECRET environment variable is required");
}
if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL environment variable is required");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
const io = new SocketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

setupChat(io);

server.listen(port, () => {
  logger.info({ port }, "WHY API server listening");
});
