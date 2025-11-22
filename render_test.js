const WebSocket = require('ws');
const axios = require('axios');

(async () => {
  const res = await axios.post('https://order-execution-engine-jw99.onrender.com/api/orders/execute', {
    userWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    tokenIn: "SOL",
    tokenOut: "USDC",
    amountIn: 1.5,
    orderType: "market",
    slippageBps: 100
  });

  const orderId = res.data.orderId;
  console.log("Order ID:", orderId);

  const ws = new WebSocket(`wss://order-execution-engine-jw99.onrender.com/api/orders/execute/${orderId}`);

  ws.on('message', msg => console.log("WS:", msg.toString()));
})();
