const WebSocket = require('ws');
const axios = require('axios');

(async () => {
  // 1. Create order with your POST body
  const res = await axios.post('http://localhost:3000/api/orders/execute', {
    userWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    tokenIn: "SOL",
    tokenOut: "USDC",
    amountIn: 1.5,
    orderType: "market",
    slippageBps: 100
  });

  const orderId = res.data.orderId;
  console.log("Order ID:", orderId);

  // 2. Connect WebSocket immediately
  const ws = new WebSocket(`ws://localhost:3000/api/orders/execute/${orderId}`);

  ws.on('message', msg => console.log("WS:", msg.toString()));
})();
