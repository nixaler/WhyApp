import { query, getClient } from "../config/database";

export type WalletTransactionType =
  | "feedback_reward"
  | "unlock_purchase"
  | "payout_request"
  | "adjustment";

/**
 * Credits a user's wallet and logs the ledger entry in one transaction.
 * `referenceId` + type carry a unique index for 'feedback_reward' (see migrations/001) —
 * pass the feedback row's id so a retried/duplicate call can never double-pay.
 */
export async function creditWallet(
  userId: string,
  amountCents: number,
  type: WalletTransactionType,
  opts: { referenceId?: string; description?: string } = {}
): Promise<{ credited: boolean; balance_cents?: number }> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO wallet_transactions (user_id, amount_cents, type, reference_id, description)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, amountCents, type, opts.referenceId ?? null, opts.description ?? null]
      );
    } catch (err: any) {
      // Unique index on (reference_id) WHERE type='feedback_reward' — already paid, not an error.
      if (err.code === "23505") {
        await client.query("ROLLBACK");
        return { credited: false };
      }
      throw err;
    }
    const { rows } = await client.query(
      `UPDATE users SET wallet_balance_cents = wallet_balance_cents + $1 WHERE id = $2 RETURNING wallet_balance_cents`,
      [amountCents, userId]
    );
    await client.query("COMMIT");
    return { credited: true, balance_cents: rows[0].wallet_balance_cents };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Debits a user's wallet if they have sufficient balance. Returns ok:false without
 * throwing when the balance is insufficient — callers use that to fall back to a
 * "pay with real money" path (not implemented yet, see unlocks.ts).
 */
export async function debitWallet(
  userId: string,
  amountCents: number,
  type: WalletTransactionType,
  opts: { referenceId?: string; description?: string } = {}
): Promise<{ ok: boolean; balance_cents: number }> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const { rows: userRows } = await client.query(
      `SELECT wallet_balance_cents FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    const balance = userRows[0]?.wallet_balance_cents ?? 0;
    if (balance < amountCents) {
      await client.query("ROLLBACK");
      return { ok: false, balance_cents: balance };
    }
    await client.query(
      `INSERT INTO wallet_transactions (user_id, amount_cents, type, reference_id, description)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, -amountCents, type, opts.referenceId ?? null, opts.description ?? null]
    );
    const { rows } = await client.query(
      `UPDATE users SET wallet_balance_cents = wallet_balance_cents - $1 WHERE id = $2 RETURNING wallet_balance_cents`,
      [amountCents, userId]
    );
    await client.query("COMMIT");
    return { ok: true, balance_cents: rows[0].wallet_balance_cents };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getWalletBalance(userId: string): Promise<number> {
  const { rows } = await query("SELECT wallet_balance_cents FROM users WHERE id = $1", [userId]);
  return rows[0]?.wallet_balance_cents ?? 0;
}
