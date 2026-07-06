import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { query } from "../config/database";

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env["JWT_SECRET"] as string) as {
      userId: string;
    };
    const { rows } = await query(
      "SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL",
      [payload.userId]
    );
    if (!rows.length) return res.status(401).json({ error: "User not found" });
    req.user = rows[0];
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

export const requirePremium = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { is_premium, premium_expires_at } = req.user;
  if (
    is_premium &&
    (!premium_expires_at || new Date(premium_expires_at) > new Date())
  ) {
    return next();
  }
  return res.status(403).json({ error: "Premium subscription required" });
};
