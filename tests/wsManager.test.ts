/**
 * Test Suite: WebSocket Manager
 * Tests WebSocket connection management and status broadcasting
 */

import { WebSocket } from 'ws';
import { 
  registerConnection, 
  sendStatus, 
  getActiveConnectionCount,
  closeConnection 
} from '../src/services/wsManager';

// Mock WebSocket
class MockWebSocket {
  public readyState = 1; // OPEN
  public sentMessages: string[] = [];
  private eventHandlers: Map<string, Function[]> = new Map();

  send(data: string) {
    this.sentMessages.push(data);
  }

  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  close() {
    this.readyState = 3; // CLOSED
    const closeHandlers = this.eventHandlers.get('close') || [];
    closeHandlers.forEach(handler => handler());
  }

  triggerError(error: Error) {
    const errorHandlers = this.eventHandlers.get('error') || [];
    errorHandlers.forEach(handler => handler(error));
  }
}

describe('WebSocket Manager', () => {
  let mockSocket: MockWebSocket;
  const testOrderId = 'test-order-123';

  beforeEach(() => {
    mockSocket = new MockWebSocket();
  });

  afterEach(() => {
    // Clean up any connections
    closeConnection(testOrderId);
  });

  describe('registerConnection', () => {
    it('should register a new WebSocket connection', () => {
      const initialCount = getActiveConnectionCount();
      
      registerConnection(testOrderId, mockSocket as unknown as WebSocket);
      
      expect(getActiveConnectionCount()).toBe(initialCount + 1);
    });

    it('should handle connection close event', () => {
      registerConnection(testOrderId, mockSocket as unknown as WebSocket);
      const countBeforeClose = getActiveConnectionCount();
      
      mockSocket.close();
      
      expect(getActiveConnectionCount()).toBe(countBeforeClose - 1);
    });

    it('should handle connection error event', () => {
      registerConnection(testOrderId, mockSocket as unknown as WebSocket);
      const countBeforeError = getActiveConnectionCount();
      
      mockSocket.triggerError(new Error('Connection error'));
      
      expect(getActiveConnectionCount()).toBe(countBeforeError - 1);
    });
  });

  describe('sendStatus', () => {
    beforeEach(() => {
      registerConnection(testOrderId, mockSocket as unknown as WebSocket);
    });

    it('should send status update to connected client', () => {
      sendStatus(testOrderId, 'pending');
      
      expect(mockSocket.sentMessages).toHaveLength(1);
      
      const message = JSON.parse(mockSocket.sentMessages[0]);
      expect(message.orderId).toBe(testOrderId);
      expect(message.status).toBe('pending');
      expect(message).toHaveProperty('timestamp');
    });

    it('should send status with additional payload', () => {
      sendStatus(testOrderId, 'confirmed', {
        txHash: 'abc123',
        executedPrice: 100.5,
      });
      
      const message = JSON.parse(mockSocket.sentMessages[0]);
      expect(message.status).toBe('confirmed');
      expect(message.txHash).toBe('abc123');
      expect(message.executedPrice).toBe(100.5);
    });

    it('should handle multiple status updates', () => {
      sendStatus(testOrderId, 'pending');
      sendStatus(testOrderId, 'routing');
      sendStatus(testOrderId, 'confirmed');
      
      expect(mockSocket.sentMessages).toHaveLength(3);
      
      const statuses = mockSocket.sentMessages.map(msg => JSON.parse(msg).status);
      expect(statuses).toEqual(['pending', 'routing', 'confirmed']);
    });

    it('should not throw error for non-existent connection', () => {
      expect(() => {
        sendStatus('non-existent-order', 'pending');
      }).not.toThrow();
    });

    it('should not send to closed connection', () => {
      mockSocket.readyState = 3; // CLOSED
      
      sendStatus(testOrderId, 'pending');
      
      expect(mockSocket.sentMessages).toHaveLength(0);
    });
  });

  describe('getActiveConnectionCount', () => {
    it('should return correct count of active connections', () => {
      const initialCount = getActiveConnectionCount();
      
      registerConnection('order-1', new MockWebSocket() as unknown as WebSocket);
      expect(getActiveConnectionCount()).toBe(initialCount + 1);
      
      registerConnection('order-2', new MockWebSocket() as unknown as WebSocket);
      expect(getActiveConnectionCount()).toBe(initialCount + 2);
    });
  });

  describe('closeConnection', () => {
    it('should close and remove connection', () => {
      registerConnection(testOrderId, mockSocket as unknown as WebSocket);
      const countBefore = getActiveConnectionCount();
      
      closeConnection(testOrderId);
      
      expect(getActiveConnectionCount()).toBe(countBefore - 1);
      expect(mockSocket.readyState).toBe(3); // CLOSED
    });

    it('should handle closing non-existent connection', () => {
      expect(() => {
        closeConnection('non-existent-order');
      }).not.toThrow();
    });
  });
});
