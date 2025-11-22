/**
 * Test Suite: DEX Router
 * Tests mock DEX quote generation, routing logic, and execution
 */

import { 
  getRaydiumQuote, 
  getMeteorQuote, 
  routeBestPrice, 
  executeSwap 
} from '../src/services/dexRouter';


describe('DEX Router', () => {
  describe('getRaydiumQuote', () => {
    it('should return a valid Raydium quote', async () => {
      const quote = await getRaydiumQuote('SOL', 'USDC', 1);

      expect(quote).toHaveProperty('dex', 'raydium');
      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('amountOut');
      expect(quote).toHaveProperty('fee');
      expect(quote.feePercent).toBe(0.3);
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.amountOut).toBeGreaterThan(0);
    });

    it('should simulate network delay', async () => {
      const start = Date.now();
      await getRaydiumQuote('SOL', 'USDC', 1);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(150);
    });

    it('should generate prices within variance range', async () => {
      const baseAmount = 100; // 1 SOL = ~100 USDC
      const quote = await getRaydiumQuote('SOL', 'USDC', 1);

      // Price should be within 98% to 102% of base (before fees)
      // After 0.3% fee, expect ~97.7% to 101.7% of base
      expect(quote.amountOut).toBeGreaterThan(baseAmount * 0.97);
      expect(quote.amountOut).toBeLessThan(baseAmount * 1.02);
    });
  });

  describe('getMeteorQuote', () => {
    it('should return a valid Meteora quote', async () => {
      const quote = await getMeteorQuote('SOL', 'USDC', 1);

      expect(quote).toHaveProperty('dex', 'meteora');
      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('amountOut');
      expect(quote).toHaveProperty('fee');
      expect(quote.feePercent).toBe(0.2);
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.amountOut).toBeGreaterThan(0);
    });

    it('should have lower fees than Raydium', async () => {
      const raydiumQuote = await getRaydiumQuote('SOL', 'USDC', 1);
      const meteoraQuote = await getMeteorQuote('SOL', 'USDC', 1);

      expect(meteoraQuote.feePercent).toBeLessThan(raydiumQuote.feePercent);
    });
  });

  describe('routeBestPrice', () => {
    it('should fetch quotes from both DEXs', async () => {
      const result = await routeBestPrice('SOL', 'USDC', 1);

      expect(result).toHaveProperty('raydiumQuote');
      expect(result).toHaveProperty('meteoraQuote');
      expect(result).toHaveProperty('bestQuote');
      expect(result.raydiumQuote.dex).toBe('raydium');
      expect(result.meteoraQuote.dex).toBe('meteora');
    });

    it('should select DEX with best output amount', async () => {
      const result = await routeBestPrice('SOL', 'USDC', 1);

      const bestAmountOut = Math.max(
        result.raydiumQuote.amountOut,
        result.meteoraQuote.amountOut
      );

      expect(result.bestQuote.amountOut).toBe(bestAmountOut);
    });

    it('should return either Raydium or Meteora as best', async () => {
      const result = await routeBestPrice('SOL', 'USDC', 1);

      expect(['raydium', 'meteora']).toContain(result.bestQuote.dex);
    });
  });

  describe('executeSwap', () => {
    let originalLog = console.log;
    beforeAll(() => { console.log = () => {}; });
    afterAll(() => { console.log = originalLog; });
    it('should execute swap and return transaction details', async () => {
      const result = await executeSwap('raydium', 'SOL', 'USDC', 1, 100, 100);

      expect(result).toHaveProperty('txHash');
      expect(result).toHaveProperty('executedPrice');
      expect(result).toHaveProperty('amountOut');
      expect(result).toHaveProperty('dex', 'raydium');
      expect(result.txHash).toHaveLength(64);
      expect(result.executedPrice).toBeGreaterThan(0);
    });

    it('should simulate execution delay of 2-3 seconds', async () => {
      const start = Date.now();
      await executeSwap('raydium', 'SOL', 'USDC', 1, 100, 100);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(2000);
      expect(duration).toBeLessThan(3200);
    });

    it('should respect slippage tolerance', async () => {
      const expectedPrice = 100;
      const slippageBps = 100; // 1%

      const result = await executeSwap('raydium', 'SOL', 'USDC', 1, expectedPrice, slippageBps);
      
      const actualSlippageBps = Math.abs((result.executedPrice - expectedPrice) / expectedPrice * 10000);
      expect(actualSlippageBps).toBeLessThanOrEqual(slippageBps);
    });

    it('should throw error if slippage exceeded', async () => {
      const expectedPrice = 100;
      const slippageBps = 1; // Very tight 0.01% tolerance

      // This should occasionally fail due to random price movement
      // We'll run it multiple times to catch slippage errors
      const attempts = 10;
      let slippageErrorThrown = false;

      for (let i = 0; i < attempts; i++) {
        try {
          await executeSwap('meteora', 'SOL', 'USDC', 1, expectedPrice, slippageBps);
        } catch (error: any) {
          if (error.message.includes('Slippage tolerance exceeded')) {
            slippageErrorThrown = true;
            break;
          }
        }
      }

      // At least one attempt should throw slippage error with such tight tolerance
      expect(slippageErrorThrown).toBe(true);
    },30000);

    it('should generate unique transaction hashes', async () => {
      const result1 = await executeSwap('raydium', 'SOL', 'USDC', 1, 100, 100);
      const result2 = await executeSwap('meteora', 'SOL', 'USDC', 1, 100, 100);

      expect(result1.txHash).not.toBe(result2.txHash);
    },10000);
  });
});
