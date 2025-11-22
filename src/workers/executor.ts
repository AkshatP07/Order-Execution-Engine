/**
 * Order Executor Worker
 * Processes orders from BullMQ queue with concurrency=10, retry=3
 * Lifecycle: pending → routing → building → submitted → confirmed/failed
 */

import { Worker, Job } from 'bullmq';
import * as dotenv from 'dotenv';
import { getOrderById, updateOrderStatus, updateOrderExecution, recordAttempt } from '../services/orderService';
import { routeBestPrice, executeSwap } from '../services/dexRouter';
import { sendStatus } from '../services/wsManager';

dotenv.config();

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const QUEUE_NAME = process.env.QUEUE_NAME || 'order-execution-queue';
const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '10');

/**
 * Process order execution job
 */
async function processOrder(job: Job): Promise<void> {
    
  const { orderId } = job.data;
  const attemptNumber = job.attemptsMade + 1;

  console.log(`\n========================================`);
  console.log(`[Worker] Processing order ${orderId} (attempt ${attemptNumber})`);
  console.log(`========================================`);

  try {
    // Fetch order from database
    const order = await getOrderById(orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    

    // STATUS: PENDING
    console.log(`[Worker] Order ${orderId} is PENDING`);
    sendStatus(orderId, 'pending', {
      message: 'Order received and queued for execution',
    });

    // Wait a bit to simulate processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // STATUS: ROUTING - Fetch quotes from both DEXs
    console.log(`[Worker] Order ${orderId} is ROUTING`);
    await updateOrderStatus(orderId, 'routing');
    sendStatus(orderId, 'routing', {
      message: 'Comparing prices from Raydium and Meteora',
    });

    const { bestQuote, raydiumQuote, meteoraQuote } = await routeBestPrice(
      order.tokenIn,
      order.tokenOut,
      order.amountIn
    );

    // Record routing decision
    await recordAttempt(orderId, attemptNumber, 'routing', undefined, bestQuote.dex);

    // STATUS: BUILDING - Create transaction
    console.log(`[Worker] Order ${orderId} is BUILDING`);
    await updateOrderStatus(orderId, 'building');
    sendStatus(orderId, 'building', {
      message: `Building transaction for ${bestQuote.dex.toUpperCase()}`,
      selectedDex: bestQuote.dex,
      raydiumQuote: raydiumQuote.price,
      meteoraQuote: meteoraQuote.price,
      bestPrice: bestQuote.price,
    });

    // Wait a bit to simulate transaction building
    await new Promise(resolve => setTimeout(resolve, 800));

    // STATUS: SUBMITTED - Execute swap
    console.log(`[Worker] Order ${orderId} is SUBMITTED`);
    await updateOrderStatus(orderId, 'submitted');
    sendStatus(orderId, 'submitted', {
      message: 'Transaction submitted to network',
      dex: bestQuote.dex,
    });

    const executionResult = await executeSwap(
      bestQuote.dex,
      order.tokenIn,
      order.tokenOut,
      order.amountIn,
      bestQuote.price,
      order.slippageBps
    );

    // STATUS: CONFIRMED - Success
    console.log(`[Worker] Order ${orderId} is CONFIRMED`);
    
    await updateOrderExecution(orderId, {
      status: 'confirmed',
      selectedDex: bestQuote.dex,
      quoteRaydium: raydiumQuote.price,
      quoteMeteora: meteoraQuote.price,
      executedPrice: executionResult.executedPrice,
      amountOut: executionResult.amountOut,
      txHash: executionResult.txHash,
    });

    await recordAttempt(orderId, attemptNumber, 'confirmed', undefined, bestQuote.dex);

    sendStatus(orderId, 'confirmed', {
      message: 'Order executed successfully',
      txHash: executionResult.txHash,
      executedPrice: executionResult.executedPrice,
      amountOut: executionResult.amountOut,
      dex: bestQuote.dex,
      raydiumQuote: raydiumQuote.price,
      meteoraQuote: meteoraQuote.price,
    });

    console.log(`[Worker] ✓ Order ${orderId} completed successfully`);
    console.log(`========================================\n`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[Worker] ✗ Error processing order ${orderId}:`, errorMessage);

    // Record failed attempt
    await recordAttempt(orderId, attemptNumber, 'failed', errorMessage);

    // If this is the last attempt, mark as failed permanently
    if (attemptNumber >= parseInt(process.env.QUEUE_MAX_RETRIES || '3')) {
      console.error(`[Worker] Order ${orderId} failed after ${attemptNumber} attempts`);
      
      await updateOrderStatus(orderId, 'failed', errorMessage);
      
      sendStatus(orderId, 'failed', {
        message: 'Order execution failed',
        error: errorMessage,
        attempts: attemptNumber,
      });
    } else {
      console.log(`[Worker] Order ${orderId} will retry (attempt ${attemptNumber}/${process.env.QUEUE_MAX_RETRIES})`);
    }

    console.log(`========================================\n`);
    
    throw error; // Re-throw to trigger BullMQ retry
  }
}

/**
 * Create and start the worker
 */
const worker = new Worker(QUEUE_NAME, processOrder, {
  connection: REDIS_CONFIG,
  concurrency: CONCURRENCY,
  limiter: {
    max: 100,
    duration: 60000, // 100 orders per minute
  },
});

// Worker event handlers
worker.on('ready', () => {
  console.log(`[Worker] Ready to process orders (concurrency: ${CONCURRENCY})`);
});

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  if (job) {
    console.error(`[Worker] Job ${job.id} failed:`, err.message);
  }
});

worker.on('error', (err) => {
  console.error('[Worker] Worker error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Worker] Shutting down gracefully...');
  await worker.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Worker] Shutting down gracefully...');
  await worker.close();
  process.exit(0);
});

console.log(`[Worker] Started with concurrency ${CONCURRENCY}`);
