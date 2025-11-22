import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { createOrder } from '../services/orderService'
import { registerConnection } from '../services/wsManager'

interface ExecuteOrderBody {
  userWallet: string
  tokenIn: string
  tokenOut: string
  amountIn: number
  orderType?: string
  slippageBps?: number
}

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {

  // -------------------------------------------
  // HTTP: POST /api/orders/execute
  // -------------------------------------------
  app.post('/api/orders/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as ExecuteOrderBody

    // Basic validation
    if (!body.userWallet || !body.tokenIn || !body.tokenOut || !body.amountIn) {
      return reply.status(400).send({
        error: 'Missing required fields: userWallet, tokenIn, tokenOut, amountIn'
      })
    }

    if (body.amountIn <= 0) {
      return reply.status(400).send({
        error: 'amountIn must be greater than 0'
      })
    }

    try {
      // Create and queue order
      const order = await createOrder({
        userWallet: body.userWallet,
        tokenIn: body.tokenIn,
        tokenOut: body.tokenOut,
        amountIn: body.amountIn,
        orderType: body.orderType || 'market',
        slippageBps: body.slippageBps || 100
      })

      console.log(`[API] Order created: ${order.id}`)

      return reply.status(201).send({
        orderId: order.id,
        status: order.status,
        message: 'Order created and queued for execution'
      })

    } catch (error) {
      console.error('[API] Error creating order:', error)
      return reply.status(500).send({
        error: 'Failed to create order'
      })
    }
  })


  // -------------------------------------------
  // WS: GET /api/orders/execute/:orderId
  // -------------------------------------------
  app.get('/api/orders/execute/:orderId', { websocket: true }, (socket, request) => {
    
  const { orderId } = request.params as { orderId: string }

  console.log(`[API] WebSocket connection for order ${orderId}`)

  // Register this WebSocket client
  registerConnection(orderId, socket)

  // Initial handshake response
  socket.send(JSON.stringify({
    orderId,
    status: 'connected',
    message: 'WebSocket connection established',
    timestamp: new Date().toISOString()
  }))

  // --- Echo support ---
  socket.on('message', (msg: Buffer) => {
    socket.send(JSON.stringify({
      echo: msg.toString(),
      timestamp: new Date().toISOString()
    }))
  })
})
}
