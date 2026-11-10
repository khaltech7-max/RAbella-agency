/**
 * Real-Time SMS & Notification WebSocket / SSE / Supabase Synchronization Client
 * 
 * Provides instantaneous event streaming between ARabella agency server
 * and browser clients. Listens for real-time Sozuri SMS dispatches,
 * payment verifications, thread messages, and SMS settings updates.
 * 
 * Supports dual-mode:
 * 1. Supabase Realtime (managed WebSocket, zero serverless constraints, works on Vercel)
 * 2. Express Server-Sent Events (SSE) & WebSocket for standalone/Node servers
 * 
 * Automatically detects serverless hosting (Vercel) to eliminate unsupported
 * raw WebSocket connections and prevent repeating 404 reconnect loops.
 */

import { SmsLogRecord } from '../data/rentalData';
import { supabase } from './supabaseClient';

export type RealtimeEventType = 
  | 'sms:dispatched'
  | 'sms:bulk_dispatched'
  | 'sms:settings_updated'
  | 'thread:updated'
  | 'payment:confirmed'
  | 'system:connected'
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
  private supabaseChannel: any = null;
  private listeners = new Set<RealtimeEventCallback>();
  private reconnectTimer: any = null;
  private isConnected = false;
  private statusListeners = new Set<(connected: boolean) => void>();
  private recentEventKeys = new Set<string>();
  private wsDisabled = false;
  private sseFailures = 0;

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
    // Generate a deduplication key
    const idKey = payload?.log?.id || payload?.threadId || payload?.payment?.id || payload?.timestamp || JSON.stringify(payload).slice(0, 60);
    const dedupeKey = `${type}:${idKey}`;
    if (this.recentEventKeys.has(dedupeKey)) {
      return; // Deduplicate
    }
    this.recentEventKeys.add(dedupeKey);
    if (this.recentEventKeys.size > 250) {
      const first = this.recentEventKeys.values().next().value;
      if (first) this.recentEventKeys.delete(first);
    }

    for (const cb of this.listeners) {
      try {
        cb(type, payload);
      } catch (err) {
        console.error('[RealtimeSMS] Listener error:', err);
      }
    }
  }

  public initConnection() {
    if (typeof window === 'undefined') return;

    // 1. Primary Real-Time Channel: Supabase Realtime (managed WebSocket, 100% Vercel compatible)
    this.connectSupabaseRealtime();

    // 2. Server-Sent Events (SSE) Stream from backend
    this.connectSse();

    // 3. Optional native WebSocket for standalone Node servers (disabled on Vercel)
    this.connectWebSocket();
  }

  private connectSupabaseRealtime() {
    if (this.supabaseChannel || !supabase) return;

    try {
      this.supabaseChannel = supabase
        .channel('arabella_realtime_sms_feed')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'sms_logs' },
          (payload: any) => {
            const row = payload.new;
            if (row) {
              this.dispatchEvent('sms:dispatched', {
                log: row,
                triggerType: row.trigger_type || 'system',
                tenantRef: row.tenant_ref || '',
                tenantName: row.recipient_name || '',
                recipientPhone: row.recipient_phone || '',
                status: row.delivery_status || 'Sent',
                network: row.network || 'Safaricom',
                providerMessageId: row.provider_message_id || '',
                timestamp: row.created_at || new Date().toISOString(),
              });
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rent_payments' },
          (payload: any) => {
            if (payload.new) {
              this.dispatchEvent('payment:confirmed', {
                payment: payload.new,
              });
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_threads' },
          (payload: any) => {
            if (payload.new) {
              this.dispatchEvent('thread:updated', payload.new);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sms_notification_settings' },
          (payload: any) => {
            if (payload.new) {
              this.dispatchEvent('sms:settings_updated', payload.new);
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            this.setStatus(true);
          }
        });
    } catch {
      // Supabase Realtime fallback to SSE
    }
  }

  private connectSse() {
    if (this.sse) return;
    if (this.sseFailures >= 3 && this.isConnected) {
      // Supabase Realtime is already active, no need to continuously retry failing SSE
      return;
    }

    try {
      const sse = new EventSource('/api/realtime/events');
      this.sse = sse;

      sse.onopen = () => {
        this.sseFailures = 0;
        this.setStatus(true);
      };

      sse.addEventListener('system:connected', () => {
        this.sseFailures = 0;
        this.setStatus(true);
      });

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
        try {
          sse.close();
        } catch {}
        this.sse = null;
        this.sseFailures += 1;

        if (!this.supabaseChannel && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
          this.setStatus(false);
        }
        this.scheduleReconnect();
      };
    } catch {
      this.sseFailures += 1;
      this.scheduleReconnect();
    }
  }

  private connectWebSocket() {
    if (this.wsDisabled) return;
    if (typeof window === 'undefined') return;

    // Vercel serverless functions do not support raw persistent WebSockets.
    // Detect Vercel host to prevent repetitive "WebSocket handshake 404" errors in the browser console.
    const hostname = window.location.hostname;
    if (hostname.endsWith('vercel.app') || hostname.includes('vercel.app')) {
      this.wsDisabled = true;
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const isHttps = window.location.protocol === 'https:';
      const wsProto = isHttps ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/api/realtime/ws`;

      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        this.setStatus(true);
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
        // Disable subsequent WebSocket reconnect attempts if serverless or unsupported
        this.wsDisabled = true;
      };

      socket.onclose = () => {
        this.ws = null;
        if (!this.sse && !this.supabaseChannel) {
          this.setStatus(false);
        }
        if (!this.wsDisabled) {
          this.scheduleReconnect();
        }
      };
    } catch {
      this.wsDisabled = true;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    // Exponential backoff to protect against console noise
    const delay = Math.min(30000, 4000 * Math.max(1, this.sseFailures));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isConnected) {
        this.initConnection();
      }
    }, delay);
  }
}

export const realtimeSmsClient = new RealtimeSmsClient();
