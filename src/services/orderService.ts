/**
 * Order Service
 * Handles database operations and queue job creation
 */

import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';

// Database connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.PGHOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.PGPORT || '5432'),
  user: process.env.POSTGRES_USER || process.env.PGUSER || 'akshat',
  password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || 'akshat',
  database: process.env.POSTGRES_DB || process.env.PGDATABASE || 'dex_orders',
});

// BullMQ Queue
const orderQueue = new Queue(process.env.QUEUE_NAME || 'order-execution-queue', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

export interface CreateOrderData {
  userWallet: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  orderType: string;
  slippageBps: number;
}

export interface Order extends CreateOrderData {
  id: string;
  status: string;
  selectedDex?: string;
  quoteRaydium?: number;
  quoteMeteora?: number;
  executedPrice?: number;
  amountOut?: number;
  txHash?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new order and add it to the queue
 */
export async function createOrder(data: CreateOrderData): Promise<Order> {
  const orderId = uuidv4();

  const query = `
    INSERT INTO orders (
      id, user_wallet, token_in, token_out, amount_in, order_type, slippage_bps, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const values = [
    orderId,
    data.userWallet,
    data.tokenIn,
    data.tokenOut,
    data.amountIn,
    data.orderType,
    data.slippageBps,
    'pending',
  ];

  const result = await pool.query(query, values);
  const order = result.rows[0];

  console.log(`[OrderService] Created order ${orderId}`);

  // Add to queue
  await orderQueue.add(
    'execute-order',
    { orderId },
    {
      delay: 10000,
      attempts: parseInt(process.env.QUEUE_MAX_RETRIES || '3'),
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    }
  );

  console.log(`[OrderService] Added order ${orderId} to queue`);

  return mapDbRowToOrder(order);
}

/**
 * Update order status
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  const query = `
    UPDATE orders
    SET status = $1, error_message = $2
    WHERE id = $3
  `;

  await pool.query(query, [status, errorMessage || null, orderId]);
  console.log(`[OrderService] Updated order ${orderId} status to ${status}`);
}

/**
 * Update order with execution results
 */
export async function updateOrderExecution(
  orderId: string,
  data: {
    status: string;
    selectedDex: string;
    quoteRaydium: number;
    quoteMeteora: number;
    executedPrice?: number;
    amountOut?: number;
    txHash?: string;
    errorMessage?: string;
  }
): Promise<void> {
  const query = `
    UPDATE orders
    SET status = $1, selected_dex = $2, quote_raydium = $3, quote_meteora = $4,
        executed_price = $5, amount_out = $6, tx_hash = $7, error_message = $8
    WHERE id = $9
  `;

  const values = [
    data.status,
    data.selectedDex,
    data.quoteRaydium,
    data.quoteMeteora,
    data.executedPrice || null,
    data.amountOut || null,
    data.txHash || null,
    data.errorMessage || null,
    orderId,
  ];

  await pool.query(query, values);
  console.log(`[OrderService] Updated order ${orderId} execution data`);
}

/**
 * Get order by ID
 */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const query = 'SELECT * FROM orders WHERE id = $1';
  const result = await pool.query(query, [orderId]);

  if (result.rows.length === 0) return null;

  return mapDbRowToOrder(result.rows[0]);
}

/**
 * Record order attempt
 */
export async function recordAttempt(
  orderId: string,
  attemptNumber: number,
  status: string,
  errorMessage?: string,
  dexUsed?: string
): Promise<void> {
  const query = `
    INSERT INTO order_attempts (order_id, attempt_number, status, error_message, dex_used)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (order_id, attempt_number) DO UPDATE
    SET status = $3, error_message = $4, dex_used = $5
  `;

  await pool.query(query, [orderId, attemptNumber, status, errorMessage || null, dexUsed || null]);
}

/**
 * NEW: Get attempts to replay history when reconnecting WS
 */
export async function getOrderAttempts(orderId: string): Promise<
  Array<{
    attempt_number: number;
    status: string;
    error_message: string | null;
    dex_used: string | null;
    attempted_at: Date;
  }>
> {
  const query = `
    SELECT attempt_number, status, error_message, dex_used, attempted_at
    FROM order_attempts
    WHERE order_id = $1
    ORDER BY attempted_at ASC, attempt_number ASC
  `;

  const result = await pool.query(query, [orderId]);
  return result.rows;
}

/**
 * Map DB row → Order object
 */
function mapDbRowToOrder(row: any): Order {
  return {
    id: row.id,
    userWallet: row.user_wallet,
    tokenIn: row.token_in,
    tokenOut: row.token_out,
    amountIn: parseFloat(row.amount_in),
    orderType: row.order_type,
    slippageBps: row.slippage_bps,
    status: row.status,
    selectedDex: row.selected_dex,
    quoteRaydium: row.quote_raydium ? parseFloat(row.quote_raydium) : undefined,
    quoteMeteora: row.quote_meteora ? parseFloat(row.quote_meteora) : undefined,
    executedPrice: row.executed_price ? parseFloat(row.executed_price) : undefined,
    amountOut: row.amount_out ? parseFloat(row.amount_out) : undefined,
    txHash: row.tx_hash,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Close DB pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

/**
 * Close queue
 */
export async function closeQueue(): Promise<void> {
  await orderQueue.close();
}
