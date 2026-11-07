/**
 * Real-Time SMS & Notification WebSocket / SSE Synchronization Client
 * 
 * Provides instantaneous bidirectional event streaming between ARabella agency
 * server and browser clients. Listens for real-time Sozuri SMS dispatches,
 * payment verifications, thread messages, and SMS settings updates.
 */

import { SmsLogRecord, SmsNotificationSettings, ChatThread } from '../data/rentalData';

export type RealtimeEventType = 
  | 'sms:dispatched'
  | 'sms:bulk_dispatched'
  | 'sms:settings_updated'
  | 'thread:updated'
  | 'payment:confirmed'
  | 'system:ping';

export interface RealtimeSmsDispatchedPayload {
  log: SmsLogRecord;
  triggerType: string;
  tenantRef: string;
  tenantName: string;
  recipientPhone: string;
  status: string;
  network?: string;
  providerMessageId?: string;
  timestamp: string;
}

export interface RealtimeSmsBulkPayload {
  logs: SmsLogRecord[];
  sentCount: number;
  skippedDuplicatesCount: number;
  failedCount: number;
  message: string;
}

export interface RealtimePaymentConfirmedPayload {
  payment: any;
  smsLog?: SmsLogRecord;
}

export type RealtimeEventCallback = (
  eventType: RealtimeEventType,
  payload: any
) => void;

class RealtimeSmsClient {
  private ws: WebSocket | null = null;
  private sse: EventSource | null = null;
  private listeners = new Set<RealtimeEventCallback>();
  private reconnectTimer: any = null;
  private isConnecting = false;
  private isConnected = false;
  private statusListeners = new Set<(connected: boolean) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.initConnection();
    }
  }

  public subscribe(callback: RealtimeEventCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public onStatusChange(callback: (connected: boolean) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.isConnected);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  public getStatus(): boolean {
    return this.isConnected;
  }

  private setStatus(connected: boolean) {
    if (this.isConnected !== connected) {
      this.isConnected = connected;
      for (const cb of this.statusListeners) {
        try {
          cb(connected);
        } catch {}
      }
    }
  }

  private dispatchEvent(type: RealtimeEventType, payload: any) {
    for (const cb of this.listeners) {
      try {
        cb(type, payload);
      } catch (err) {
        console.error('[RealtimeSMS] Listener error:', err);
      }
    }
  }

  private initConnection() {
    if (this.isConnecting || typeof window === 'undefined') return;
    this.isConnecting = true;

    try {
      const isHttps = window.location.protocol === 'https:';
      const wsProto = isHttps ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/api/realtime/ws`;

      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        this.isConnecting = false;
        this.setStatus(true);
        // Send subscription message
        try {
          socket.send(JSON.stringify({ type: 'subscribe', channel: 'sms_notifications' }));
        } catch {}
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.event) {
            this.dispatchEvent(parsed.event, parsed.data);
          } else if (parsed.type) {
            this.dispatchEvent(parsed.type, parsed.data || parsed.payload || parsed);
          }
        } catch {}
      };

      socket.onerror = () => {
        // Fall back to SSE if WebSocket error
        this.fallbackToSse();
      };

      socket.onclose = () => {
        this.ws = null;
        this.isConnecting = false;
        this.setStatus(false);
        this.scheduleReconnect();
      };
    } catch {
      this.isConnecting = false;
      this.fallbackToSse();
    }
  }

  private fallbackToSse() {
    if (this.sse) return;
    try {
      const sse = new EventSource('/api/realtime/events');
      this.sse = sse;

      sse.onopen = () => {
        this.setStatus(true);
      };

      sse.addEventListener('sms:dispatched', (e: MessageEvent) => {
        try {
          this.dispatchEvent('sms:dispatched', JSON.parse(e.data));
        } catch {}
      });

      sse.addEventListener('sms:bulk_dispatched', (e: MessageEvent) => {
        try {
          this.dispatchEvent('sms:bulk_dispatched', JSON.parse(e.data));
        } catch {}
      });

      sse.addEventListener('sms:settings_updated', (e: MessageEvent) => {
        try {
          this.dispatchEvent('sms:settings_updated', JSON.parse(e.data));
        } catch {}
      });

      sse.addEventListener('thread:updated', (e: MessageEvent) => {
        try {
          this.dispatchEvent('thread:updated', JSON.parse(e.data));
        } catch {}
      });

      sse.addEventListener('payment:confirmed', (e: MessageEvent) => {
        try {
          this.dispatchEvent('payment:confirmed', JSON.parse(e.data));
        } catch {}
      });

      sse.onerror = () => {
        sse.close();
        this.sse = null;
        this.setStatus(false);
        this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initConnection();
    }, 4000);
  }
}

export const realtimeSmsClient = new RealtimeSmsClient();
