/**
 * REAL concurrency test hitting:
 *   - Fastify HTTP
 *   - WebSocket manager
 *   - Worker (BullMQ)
 *
 * Needs worker running separately in terminal.
 */

import axios from "axios";
import WebSocket from "ws";

jest.setTimeout(60000); // 60 seconds

const API = "http://localhost:3000/api/orders/execute";

describe("Real Concurrency Test", () => {
  it("should process 5 orders concurrently", async () => {
    const orderCount = 5;

    const orderIds: string[] = [];
    const sockets: Record<string, WebSocket> = {};
    const events: Record<string, string[]> = {};

    // ---------------------------------------------------
    // 1) FIRE ALL ORDER CREATION REQUESTS AT SAME TIME
    // ---------------------------------------------------
    const createRequests = [];

    for (let i = 0; i < orderCount; i++) {
      createRequests.push(
        axios.post(API, {
          userWallet: "test_wallet",
          tokenIn: "SOL",
          tokenOut: "USDC",
          amountIn: 1,
        })
      );
    }

    const responses = await Promise.all(createRequests);

    responses.forEach((res) => {
      const id = res.data.orderId;
      orderIds.push(id);
      events[id] = [];
    });

    // ---------------------------------------------------
    // 2) OPEN ALL WEBSOCKET CONNECTIONS IN PARALLEL
    // ---------------------------------------------------
    await Promise.all(
      orderIds.map(
        (id) =>
          new Promise<void>((resolve) => {
            const ws = new WebSocket(`ws://localhost:3000/api/orders/execute/${id}`);
            sockets[id] = ws;

            ws.on("open", () => resolve());

            ws.on("message", (raw) => {
              const msg = JSON.parse(raw.toString());
              events[id].push(msg.status || msg.echo);
            });
          })
      )
    );

    // ---------------------------------------------------
    // 3) WAIT UNTIL ALL ORDERS HIT “confirmed”
    // ---------------------------------------------------
    await new Promise<void>((resolve, reject) => {
      const started = Date.now();

      const interval = setInterval(() => {
        const allDone = orderIds.every((id) =>
          events[id].includes("confirmed")
        );

        if (allDone) {
          clearInterval(interval);
          resolve();
        }

        if (Date.now() - started > 50000) {
          clearInterval(interval);
          reject(new Error("Timeout: some orders never confirmed"));
        }
      }, 500);
    });

    // ---------------------------------------------------
    // 4) ASSERT: every order should hit "confirmed"
    // ---------------------------------------------------
    orderIds.forEach((id) => {
      expect(events[id]).toContain("confirmed");
    });

    // ---------------------------------------------------
    // 5) Close all sockets
    // ---------------------------------------------------
    orderIds.forEach((id) => sockets[id].close());
  });
});
