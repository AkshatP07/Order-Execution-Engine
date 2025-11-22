# DEX Order Execution Engine

A high-performance order execution engine with DEX routing, real-time WebSocket updates, and concurrent order processing using BullMQ.

**Order Type:** Market Orders

**Why Market Orders?**
Market orders provide immediate execution at the best available price, making them ideal for demonstrating the routing and execution engine without requiring price monitoring or trigger-based logic.

**Extension to Other Order Types:**

* **Limit Orders:** Add a price watcher service that monitors DEX prices and triggers execution when the target price is met.
* **Sniper Orders:** Listen for token launch or migration events (Raydium/Meteora pool creation) and trigger instant execution.

---

## Architecture

**Tech Stack**

* Node.js + TypeScript
* Fastify (with WebSocket support)
* BullMQ + Redis
* PostgreSQL
* Mock DEX Router (Raydium + Meteora simulation)

**Project Structure**

```
src/
├── index.ts                 # Fastify server entry point
├── api/
│   └── orders.ts           # POST /api/orders/execute + GET /api/orders/execute/:orderId (WebSocket)
├── services/
│   ├── dexRouter.ts        # Mock DEX routing (Raydium/Meteora quotes)
│   ├── orderService.ts     # Database operations + BullMQ producer
│   └── wsManager.ts        # WebSocket connection management
├── workers/
│   └── executor.ts         # BullMQ worker (concurrency=10, retry=3)
└── db/
    └── migrations.sql      # PostgreSQL schema
```

---

## Order Lifecycle

```
POST /api/orders/execute
    ↓
[Database] Order saved with status: pending
    ↓
[BullMQ] Job added to queue
    ↓
[Worker] Picks job (concurrency: 10)
    ↓
WebSocket (GET /api/orders/execute/:orderId):
pending → routing → building → submitted → confirmed/failed
```

---

## Single Endpoint Family (Requirement)

This system uses a single logical endpoint family for both HTTP and WebSocket:

* **HTTP (order submission):** `POST /api/orders/execute`
* **WebSocket (status stream):** `GET /api/orders/execute/:orderId`

This satisfies the requirement that a single endpoint handles both protocols.

---

## Setup Instructions

### Prerequisites

* Node.js 18+
* Docker and Docker Compose

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

**Default configuration:**

```
PORT=3000
POSTGRES_HOST=localhost
POSTGRES_USER=akshat
POSTGRES_PASSWORD=akshat
POSTGRES_DB=dex_orders
REDIS_HOST=localhost
REDIS_PORT=6379
QUEUE_CONCURRENCY=10
QUEUE_MAX_RETRIES=3
```

### 3. Start Docker Services

```bash
npm run docker:up
```

Verify:

```bash
docker ps
```

### 4. Start Application

**API Server (Terminal 1):**

```bash
npm run dev
```

**Worker (Terminal 2):** (if running separate process)

```bash
npm run worker
```

Server runs on `http://localhost:3000`.

---

## API Usage

### Submit Order

`POST http://localhost:3000/api/orders/execute`

**Body:**

```json
{
  "userWallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": 1.5,
  "orderType": "market",
  "slippageBps": 100
}
```

**Response:**

```json
{
  "orderId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "pending",
  "message": "Order created and queued for execution"
}
```

---

## WebSocket Status Updates

**WebSocket Endpoint:**

```
ws://localhost:3000/api/orders/execute/:orderId
```

**Example:**

```javascript
const ws = new WebSocket(
  'ws://localhost:3000/api/orders/execute/a1b2c3d4-e5f6-7890'
);

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log(update.status, update);
};
```

**Status Flow:**

* connected
* pending
* routing
* building
* submitted
* confirmed (txHash, executedPrice, amountOut)
* failed (error message)

---

## Testing

Run tests:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Coverage includes:

* DEX routing comparison
* Queue concurrency and retries
* WebSocket lifecycle
* Order status transitions
* Slippage handling
* Database operations
* Mock DEX Implementation

---

## Mock DEX Implementation

**Price Simulation**

* Raydium: `base × (0.98 + random × 0.04)` with 0.3% fee
* Meteora: `base × (0.97 + random × 0.05)` with 0.2% fee

Router selects the best output.

**Execution Simulation**

* 2–3 second artificial delay
* Generates mock transaction hash
* Slippage enforced

---

## Configuration

**Queue Settings**

* Concurrency: 10
* Rate Limit: 100/min
* Retry: 3 attempts with exponential backoff (2s, 4s, 8s)

**Slippage Protection**

* Default: 1% (100 bps)
* If exceeded, order is failed.

**Development**

Build TypeScript:

```bash
npm run build
```

Start production:

```bash
npm start
```

Docker logs:

```bash
npm run docker:logs
```

Stop services:

```bash
npm run docker:down
```

---

## Database Schema

**Orders Table Fields**

* id
* status
* selected_dex
* quote_raydium
* quote_meteora
* executed_price
* tx_hash

**Order Attempts Table**

* Tracks retries and failure reasons.

---

## Error Handling

* Input validation
* Slippage checks
* Worker errors with retry
* Final failure persistence

---

## Logging

Prefixes:

* [API]
* [OrderService]
* [Router]
* [Worker]
* [WS]

---

## Key Features

* Dual DEX routing
* Real-time WebSocket updates
* Concurrent processing
* Retry logic
* Slippage protection
* Full history tracking
* Mock implementation

---

## License

MIT

---

## Design PDF

Backend Task PDF (design & requirements):
`/mnt/data/Backend Task 2_ Order Execution Engine.pdf`
