import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import logger from '../config/logger';

interface CheckInEvent {
  type: 'checkin';
  gym_id: string;
  member_name: string;
  check_in_time: string;
  entry_method: string;
}

interface AuthMessage {
  type: 'auth';
  token: string;
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const AUTH_TIMEOUT_MS = 5000;

let wss: WebSocketServer | null = null;

const gymClients = new Map<string, Set<WebSocket>>();

function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { gym_id: string };
    return decoded.gym_id || null;
  } catch {
    return null;
  }
}

export function initRealtimeServer(port: number = 4001): WebSocketServer {
  wss = new WebSocketServer({ port });

  wss.on('error', (err: Error) => {
    logger.error(`WebSocket server error on port ${port}`, { error: err.message });
  });

  wss.on('connection', (ws, _req) => {
    let gymId: string | null = null;
    let authenticated = false;

    const authTimer = setTimeout(() => {
      if (!authenticated) {
        logger.warn('Realtime auth timeout');
        ws.close(4001, 'Authentication timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (raw) => {
      if (authenticated) return;

      try {
        const msg: AuthMessage = JSON.parse(raw.toString());
        if (msg.type !== 'auth' || !msg.token) {
          ws.close(4001, 'Unauthorized: first message must be auth');
          return;
        }

        gymId = verifyToken(msg.token);
        if (!gymId) {
          ws.close(4001, 'Unauthorized: invalid token');
          return;
        }

        clearTimeout(authTimer);
        authenticated = true;

        if (!gymClients.has(gymId)) {
          gymClients.set(gymId, new Set());
        }
        gymClients.get(gymId)!.add(ws);

        logger.info(`Realtime client connected`, { gymId, totalClients: gymClients.get(gymId)!.size });
        ws.send(JSON.stringify({ type: 'connected', message: 'Realtime channel established' }));
      } catch {
        ws.close(4001, 'Unauthorized: invalid message format');
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (gymId) {
        gymClients.get(gymId)?.delete(ws);
        if (gymClients.get(gymId)?.size === 0) {
          gymClients.delete(gymId);
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(authTimer);
      logger.error('Realtime WS error', { gymId, error: err.message });
      if (gymId) {
        gymClients.get(gymId)?.delete(ws);
      }
    });
  });

  logger.info(`Realtime WebSocket server listening on port ${port}`);
  return wss;
}

export function broadcastCheckIn(event: CheckInEvent): void {
  const clients = gymClients.get(event.gym_id);
  if (!clients || clients.size === 0) return;

  const message = JSON.stringify(event);
  let sent = 0;
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sent++;
    }
  }
  logger.debug(`Broadcast check-in`, { gymId: event.gym_id, recipients: sent });
}

export function getRealtimeStats(): { connectedGyms: number; totalClients: number } {
  let total = 0;
  for (const clients of gymClients.values()) {
    total += clients.size;
  }
  return { connectedGyms: gymClients.size, totalClients: total };
}
