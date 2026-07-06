import { Server as SocketIO } from "socket.io";
import jwt from "jsonwebtoken";
import { query } from "../config/database";

export function setupChat(io: SocketIO) {
  // Middleware: require JWT in socket.handshake.auth.token
  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as any)?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload = jwt.verify(
        token,
        process.env["JWT_SECRET"] as string
      ) as { userId: string };
      const { rows } = await query(
        "SELECT id, name FROM users WHERE id=$1 AND deleted_at IS NULL",
        [payload.userId]
      );
      if (!rows.length) return next(new Error("User not found"));
      (socket as any).user = rows[0];
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user;
    socket.join(`user:${user.id}`);

    socket.on("join_match", async ({ matchId }) => {
      const { rows } = await query(
        "SELECT * FROM matches WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)",
        [matchId, user.id]
      );
      if (!rows.length)
        return socket.emit("error", { message: "Match not found" });
      socket.join(`match:${matchId}`);
      socket.emit("joined_match", { matchId });
    });

    socket.on("send_message", async ({ matchId, content }) => {
      if (!content?.trim())
        return socket.emit("error", { message: "Content required" });
      const { rows: matchRows } = await query(
        "SELECT * FROM matches WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)",
        [matchId, user.id]
      );
      if (!matchRows.length)
        return socket.emit("error", { message: "Match not found" });
      const { rows } = await query(
        `INSERT INTO messages (match_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *`,
        [matchId, user.id, content.trim()]
      );
      io.to(`match:${matchId}`).emit("new_message", { message: rows[0] });
    });

    socket.on("typing", ({ matchId, isTyping }) => {
      socket.to(`match:${matchId}`).emit("user_typing", {
        userId: user.id,
        isTyping,
      });
    });
  });
}
