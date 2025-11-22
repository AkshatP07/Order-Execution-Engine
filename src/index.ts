/**
 * Main Server Entry Point
 * Starts Fastify with WebSocket support and registers routes
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import * as dotenv from 'dotenv';
import { registerOrderRoutes } from './api/orders';

dotenv.config();

import './workers/executor';

const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register WebSocket plugin
  await app.register(websocket);

  // Health check endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register order routes (including WebSocket)
  await registerOrderRoutes(app);

  // Start server
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 DEX Order Execution Engine Started                   ║
║                                                            ║
║   Server:     http://${HOST}:${PORT}                        ║
║   Health:     http://${HOST}:${PORT}/health                ║
║   API:        POST http://${HOST}:${PORT}/api/orders/execute ║
║   WebSocket:  ws://localhost:3000/api/orders/execute/:orderId║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down gracefully...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();
