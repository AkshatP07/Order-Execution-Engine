# Quick Start Guide

Get the Order Execution Engine running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Start Docker Services

```bash
npm run docker:up
```

Wait ~10 seconds for PostgreSQL and Redis to be ready.

## Step 3: Start the Application (Single Process: API + Worker)

Open **one terminal** in this directory:

### API Server + Worker (Same Process)

```bash
npm run dev
```

You should see:

```
🚀 DEX Order Execution Engine Started
[Worker] Started with concurrency 10
Server:     http://0.0.0.0:3000
```

This means:

* Fastify API is running
* WebSocket server is running
* BullMQ Worker is running in the same process (shared memory)

No need for a separate `npm run worker`.

## Step 4: Submit Your First Order

### Option A: Using curl (Windows PowerShell)

```powershell
curl -X POST http://localhost:3000/api/orders/execute `
  -H "Content-Type: application/json" `
  -d '{"userWallet":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU","tokenIn":"SOL","tokenOut":"USDC","amountIn":1.5,"orderType":"market","slippageBps":100}'
```

### Option B: Using Postman

Use this exact body:

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

**TIP:** The worker starts processing immediately. You must copy your `orderId` from the POST response *fast* and paste it into WebSocket connection before the job finishes.

### Option C: Using the automated test client

```bash
node client.js
```

This script:

* Submits the order
* Automatically extracts orderId
* Automatically opens the WebSocket
* Prints all live updates

### Response

You'll receive an `orderId`:

```json
{
  "orderId": "a1b2c3d4-...",
  "status": "pending",
  "message": "Order created and queued for execution"
}
```

## Step 5: Watch Live Updates (WebSocket)

Connect via WebSocket to see real-time status updates:

```javascript
const ws = new WebSocket('ws://localhost:3000/api/orders/execute/YOUR_ORDER_ID');

ws.onmessage = (event) => {
  console.log(JSON.parse(event.data));
};
```

Or simply watch the server logs for:

* DEX quote comparisons
* Routing decisions
* Transaction execution
* Final mock txHash

## Expected Flow

You will see the order progress through:

1. **pending** – Order received
2. **routing** – Fetching Raydium & Meteora quotes
3. **building** – Preparing best DEX transaction
4. **submitted** – Sending transaction
5. **confirmed** – Execution successful

Total time: ~4–5 seconds.

## Run Tests

```bash
npm test
```

Covers:

* Routing logic
* WebSocket lifecycle
* Order validation
* Slippage control
* Retry behavior

## Troubleshooting

### Docker containers not starting?

```bash
docker ps
```

If empty:

```bash
npm run docker:down
npm run docker:up
```

### Port 3000 in use?

Set `PORT=3001` in `.env`

### PostgreSQL isn't ready?

Wait 15 seconds after `docker:up`

## What's Happening Internally

1. **Order Submitted** → inserted into PostgreSQL + pushed to BullMQ
2. **Worker Picks Job** → fetches mock DEX quotes
3. **Route Best Price** → Raydium vs Meteora
4. **Mock Execute** → simulate blockchain tx
5. **Persist Result** → save execution outcome
6. **WebSocket Stream** → send live status updates

## Stop Services

```bash
# Stop API+Worker: Ctrl+C
npm run docker:down
```

---

🎉 **You're all set!** The engine now processes orders with real-time WebSocket updates and dual-DEX routing.
