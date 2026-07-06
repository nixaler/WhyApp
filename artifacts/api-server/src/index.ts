import http from "http";
import { Server as SocketIO } from "socket.io";
import app from "./app";
import { setupChat } from "./socket/chat";
import { logger } from "./lib/logger";

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
