# Design Decisions

This section briefly explains the key architectural decisions made while building the Order Execution Engine, and how the system satisfies all the core requirements of the task.

## 1. Order Type Selection: Market Orders

I selected **Market Orders** because they allow immediate execution, which makes it ideal for:

- Demonstrating the DEX router (Raydium vs Meteora)
- Showing execution lifecycle through WebSockets
- Keeping the system deterministic for evaluation

### Extensibility
- **Limit Orders:** Add a price-watcher service that polls DEX quotes and triggers processing when target price is reached.
- **Sniper Orders:** Listen for Raydium/Meteora pool creation events and trigger instant execution.

The engine’s internal worker system + routing logic already support both with minimal modification.

## 2. Single Endpoint Family (HTTP + WebSocket)

The system uses **one logical endpoint** as required:

- `POST /api/orders/execute` → submits an order and returns `orderId`
- `GET  /api/orders/execute/:orderId` → upgrades to a WebSocket connection

This satisfies the requirement that a single endpoint family handles both order creation and live execution updates.

## 3. DEX Router Design

The router compares prices from **Raydium** and **Meteora** using a mock implementation:

- Both quotes include randomized variance (2–5%), simulating slippage/liquidity differences.
- Router selects the best output amount.
- Every routing decision is logged for transparency.

If extended to devnet, the router can directly integrate:
- @raydium-io/raydium-sdk-v2  
- @meteora-ag/dynamic-amm-sdk  

## 4. Real-Time WebSocket Lifecycle

Every order has a clear lifecycle streamed over WebSockets:

pending → routing → building → submitted → confirmed/failed

Internally:
- WebSocket connections are tracked using an in-memory registry.
- Worker sends updates via a shared WebSocket manager.
- Clients reconnect gracefully using orderId.

This ensures real-time visibility of progress for all active orders.

## 5. Concurrent Processing with BullMQ

The engine uses **BullMQ** with configurable concurrency (default: 10).

Benefits:
- Parallel execution of multiple orders
- Automatic retries with exponential backoff
- Isolation between jobs
- Durable queue backed by Redis

This meets the requirement of processing ~100 orders/minute.

## 6. Error Handling & Retries

Each order can retry up to 3 times.

For every attempt:
- attempt_number is logged in the `order_attempts` table
- any failure is persisted for audit/debugging
- WebSocket emits `failed` only when retries are exhausted

This ensures transparency and reliability when DEX calls fail.

## 7. Database Architecture

Two tables:

1. `orders` — stores the order and final execution metadata  
2. `order_attempts` — logs each retry attempt  

Benefits:
- Full historical trace of execution
- No data loss even if worker crashes
- Easy debugging for routing/execution failures

Triggers keep `updated_at` consistent automatically.

## 8. Mock Execution (Meteora/Raydium)

Execution is simulated with:
- 2–3 second delay
- Randomized execution price
- Mock transaction hash

This keeps the execution flow realistic while avoiding Solana devnet complexity.

## 9. Deployment Decision: Render

I deployed the system on Render because:
- Free tier for PostgreSQL + Redis (Valkey)
- Auto-scaling web service
- Straightforward environment variable setup

The public URL allows the reviewers to test:
- POST order submission
- WebSocket live streaming
- Routing logs
- Queue behaviour
