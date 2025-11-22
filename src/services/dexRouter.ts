/**
 * Mock DEX Router
 * Simulates price quotes from Raydium and Meteora DEXs
 * NO real blockchain calls - all mock implementation
 */

export interface DexQuote {
  dex: 'raydium' | 'meteora';
  price: number;
  amountOut: number;
  fee: number;
  feePercent: number;
}

export interface ExecutionResult {
  txHash: string;
  executedPrice: number;
  amountOut: number;
  dex: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate a mock transaction hash
 */
function generateMockTxHash(): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
}

/**
 * Calculate base price from token pair
 * This is a simplified mock - in reality you'd fetch from pools
 */
function calculateBasePrice(tokenIn: string, tokenOut: string, amountIn: number): number {
  // Mock base prices for common pairs
  const pairKey = `${tokenIn.toLowerCase()}_${tokenOut.toLowerCase()}`;
  
  const basePrices: Record<string, number> = {
    'sol_usdc': 100,
    'usdc_sol': 0.01,
    'sol_usdt': 100,
    'usdt_sol': 0.01,
  };

  const basePrice = basePrices[pairKey] || 1;
  return basePrice * amountIn;
}

/**
 * Get mock quote from Raydium
 * Price variance: basePrice * (0.98 + random * 0.04)
 */
export async function getRaydiumQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: number
): Promise<DexQuote> {
  // Simulate network delay
  await sleep(150 + Math.random() * 100);

  const baseAmount = calculateBasePrice(tokenIn, tokenOut, amountIn);
  const priceVariance = 0.98 + Math.random() * 0.04; // 98% to 102%
  const feePercent = 0.003; // 0.3% fee
  
  const amountOut = baseAmount * priceVariance * (1 - feePercent);
  const price = amountOut / amountIn;

  console.log(`[Raydium] Quote: ${amountIn} ${tokenIn} → ${amountOut.toFixed(6)} ${tokenOut} (price: ${price.toFixed(6)})`);

  return {
    dex: 'raydium',
    price,
    amountOut,
    fee: baseAmount * priceVariance * feePercent,
    feePercent: 0.3,
  };
}

/**
 * Get mock quote from Meteora
 * Price variance: basePrice * (0.97 + random * 0.05)
 */
export async function getMeteorQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: number
): Promise<DexQuote> {
  // Simulate network delay
  await sleep(10000 + Math.random() * 100);

  const baseAmount = calculateBasePrice(tokenIn, tokenOut, amountIn);
  const priceVariance = 0.97 + Math.random() * 0.05; // 97% to 102%
  const feePercent = 0.002; // 0.2% fee
  
  const amountOut = baseAmount * priceVariance * (1 - feePercent);
  const price = amountOut / amountIn;

  console.log(`[Meteora] Quote: ${amountIn} ${tokenIn} → ${amountOut.toFixed(6)} ${tokenOut} (price: ${price.toFixed(6)})`);

  return {
    dex: 'meteora',
    price,
    amountOut,
    fee: baseAmount * priceVariance * feePercent,
    feePercent: 0.2,
  };
}

/**
 * Route order to best DEX based on price comparison
 */
export async function routeBestPrice(
  tokenIn: string,
  tokenOut: string,
  amountIn: number
): Promise<{ bestQuote: DexQuote; raydiumQuote: DexQuote; meteoraQuote: DexQuote }> {
  console.log(`\n[Router] Fetching quotes for ${amountIn} ${tokenIn} → ${tokenOut}...`);

  // Fetch both quotes in parallel
  const [raydiumQuote, meteoraQuote] = await Promise.all([
    getRaydiumQuote(tokenIn, tokenOut, amountIn),
    getMeteorQuote(tokenIn, tokenOut, amountIn),
  ]);

  // Select best price (highest amountOut)
  const bestQuote = raydiumQuote.amountOut > meteoraQuote.amountOut ? raydiumQuote : meteoraQuote;

  const improvement = ((bestQuote.amountOut - Math.min(raydiumQuote.amountOut, meteoraQuote.amountOut)) / Math.min(raydiumQuote.amountOut, meteoraQuote.amountOut) * 100).toFixed(2);
  
  console.log(`[Router] Best DEX: ${bestQuote.dex.toUpperCase()} (${improvement}% better)`);

  return { bestQuote, raydiumQuote, meteoraQuote };
}

/**
 * Execute mock swap on selected DEX
 * Simulates 2-3 second execution time
 */
export async function executeSwap(
  dex: 'raydium' | 'meteora',
  _tokenIn: string,
  _tokenOut: string,
  amountIn: number,
  expectedPrice: number,
  slippageBps: number
): Promise<ExecutionResult> {
  console.log(`\n[${dex.toUpperCase()}] Executing swap...`);
  
  // Simulate transaction building and submission delay
  await sleep(2000 + Math.random() * 1000);

  // Simulate slight price movement during execution
  const priceSlippage = 1 + (Math.random() - 0.5) * (slippageBps / 10000) * 0.8;
  const executedPrice = expectedPrice * priceSlippage;
  const amountOut = amountIn * executedPrice;

  // Check if slippage exceeded
  const actualSlippageBps = Math.abs((executedPrice - expectedPrice) / expectedPrice * 10000);
  
  if (actualSlippageBps > slippageBps) {
    throw new Error(`Slippage tolerance exceeded: ${actualSlippageBps.toFixed(0)} bps > ${slippageBps} bps`);
  }

  const txHash = generateMockTxHash();

  console.log(`[${dex.toUpperCase()}] Swap executed successfully!`);
  console.log(`[${dex.toUpperCase()}] TX: ${txHash}`);
  console.log(`[${dex.toUpperCase()}] Price: ${executedPrice.toFixed(6)} (slippage: ${actualSlippageBps.toFixed(2)} bps)`);

  return {
    txHash,
    executedPrice,
    amountOut,
    dex,
  };
}
