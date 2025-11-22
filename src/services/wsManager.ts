/**
 * WebSocket Manager
 * Manages WebSocket connections and sends order status updates
 */

import { WebSocket } from 'ws';
import { getOrderById, getOrderAttempts } from './orderService';

// Map orderId to WebSocket connection
const orderConnections = new Map<string, WebSocket>();

/**
 * Register a WebSocket connection for an order
 * - restores latest DB state
 * - replays historical attempts (if any)
 */
export async function registerConnection(orderId: string, socket: WebSocket): Promise<void> {
  orderConnections.set(orderId, socket);
  console.log(`[WS] Client connected for order ${orderId}`);

  // Immediately send latest order state from DB
  try {
    const order = await getOrderById(orderId);
    if (order) {
      const stateMsg = {
        orderId,
        status: order.status,
        selectedDex: order.selectedDex,
        executedPrice: order.executedPrice,
        amountOut: order.amountOut,
        txHash: order.txHash,
        message: 'Restored last known status',
        timestamp: new Date().toISOString(),
      };
      socket.send(JSON.stringify(stateMsg));
      console.log(`[WS] Restored state for order ${orderId}: ${order.status}`);
    }
  } catch (err) {
    console.error(`[WS] Failed to restore state for order ${orderId}:`, err);
  }

  // Replay historical attempts (if any)
  try {
    const attempts = await getOrderAttempts(orderId);
    for (const a of attempts) {
      // send each attempt as an event so client sees timeline
      const attemptMsg = {
        orderId,
        status: a.status,
        attemptNumber: a.attempt_number,
        errorMessage: a.error_message || undefined,
        dexUsed: a.dex_used || undefined,
        attemptedAt: a.attempted_at,
        message: `Replayed attempt ${a.attempt_number}`,
        timestamp: new Date().toISOString(),
      };
      try {
        socket.send(JSON.stringify(attemptMsg));
      } catch (e) {
        console.warn(`[WS] Failed to send replay attempt for order ${orderId}:`, e);
      }
    }
    if (attempts.length) console.log(`[WS] Replayed ${attempts.length} attempts for order ${orderId}`);
  } catch (err) {
    console.error(`[WS] Failed to load attempts for order ${orderId}:`, err);
  }

  // Clean up on disconnect
  socket.on('close', () => {
    orderConnections.delete(orderId);
    console.log(`[WS] Client disconnected for order ${orderId}`);
  });

  socket.on('error', (error) => {
    console.error(`[WS] Error for order ${orderId}:`, (error && (error as Error).message) || error);
    orderConnections.delete(orderId);
  });
}

/**
 * Send status update to client for specific order
 */
export function sendStatus(
  orderId: string,
  status: string,
  payload?: Record<string, any>
): void {
  const socket = orderConnections.get(orderId);

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn(`[WS] No active connection for order ${orderId}`);
    return;
  }

  const message = {
    orderId,
    status,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  try {
    socket.send(JSON.stringify(message));
    console.log(`[WS] Sent status '${status}' to order ${orderId}`);
  } catch (error) {
    console.error(`[WS] Failed to send message to order ${orderId}:`, error);
  }
}

/**
 * Get count of active connections
 */
export function getActiveConnectionCount(): number {
  return orderConnections.size;
}

/**
 * Close connection for specific order
 */
export function closeConnection(orderId: string): void {
  const socket = orderConnections.get(orderId);
  
  if (socket) {
    socket.close();
    orderConnections.delete(orderId);
    console.log(`[WS] Closed connection for order ${orderId}`);
  }
}
