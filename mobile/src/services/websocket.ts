import { useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type WsMessage = {
  type: 'checkin' | 'notification' | 'booking_update' | 'subscription_update';
  payload: Record<string, any>;
};

type MessageHandler = (msg: WsMessage) => void;

const WS_URL = __DEV__ ? 'ws://10.0.2.2:4000' : 'wss://api.gimawi.com';
const TOKEN_KEY = 'gimawi_access_token';

export function useWebSocket(handlers: {
  onCheckin?: MessageHandler;
  onNotification?: MessageHandler;
  onBookingUpdate?: MessageHandler;
  onSubscriptionUpdate?: MessageHandler;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const isMounted = useRef(true);

  const connect = useCallback(async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'checkin': handlers.onCheckin?.(msg); break;
          case 'notification': handlers.onNotification?.(msg); break;
          case 'booking_update': handlers.onBookingUpdate?.(msg); break;
          case 'subscription_update': handlers.onSubscriptionUpdate?.(msg); break;
        }
      } catch {}
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      if (isMounted.current) {
        reconnectTimer.current = setTimeout(connect, 5000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [handlers]);

  useEffect(() => {
    connect();
    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);
}

export async function sendWsMessage(message: WsMessage): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(message));
        ws.close();
        resolve();
      };
      ws.onerror = reject;
    });
  } catch {}
}
