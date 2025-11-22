/**
 * WebSocket Manager
 * Manages WebSocket connections and sends order status updates
 */

import { WebSocket } from 'ws';
import { getOrderById } from '../services/orderService';

// Map orderId to WebSocket connection
const orderConnections = new Map<string, WebSocket>();

/**
 * Register a WebSocket connection for an order
 */
export async function registerConnection(orderId: string, socket: WebSocket): Promise<void> {
  orderConnections.set(orderId, socket);
  console.log(`[WS] Client connected for order ${orderId}`);

  // ---- IMPORTANT FIX ----
  // Send last known status immediately on connect
  try {
    const order = await getOrderById(orderId);

    if (order) {
      socket.send(
        JSON.stringify({
          orderId,
          status: order.status,
          message: "Restored last known status",
          timestamp: new Date().toISOString(),
        })
      );

      console.log(`[WS] Restored state for order ${orderId}: ${order.status}`);
    }
  } catch (err) {
    console.error(`[WS] Failed to restore state for order ${orderId}:`, err);
  }

  // Clean up on disconnect
  socket.on('close', () => {
    orderConnections.delete(orderId);
    console.log(`[WS] Client disconnected for order ${orderId}`);
  });

  socket.on('error', (error) => {
    console.error(`[WS] Error for order ${orderId}:`, error.message);
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
