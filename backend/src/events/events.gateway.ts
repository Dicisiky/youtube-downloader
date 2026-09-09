import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'ws';
import type { IncomingMessage } from 'http';
import { AuthService, SESSION_COOKIE } from '../auth/auth.service';

/**
 * Fan-out gateway. Every mutation in channels/monitor/ytdlp/youtube services
 * calls broadcast(...) here instead of managing its own transport, so the
 * frontend's single socket connection sees every state transition in the
 * pipeline (MONITORING -> RECORDING -> PROCESSING -> UPLOADING -> COMPLETED/FAILED).
 */
export type ServerEvent =
  | { type: 'channel.updated'; payload: unknown }
  | { type: 'job.updated'; payload: unknown }
  | { type: 'job.created'; payload: unknown }
  | { type: 'log'; payload: { message: string; level: 'info' | 'warn' | 'error' } };

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

@Injectable()
@WebSocketGateway({ path: '/ws', cors: true })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);
  private clients = new Set<any>();

  @WebSocketServer()
  server: Server;

  constructor(private readonly auth: AuthService) {}

  /**
   * Same access rule as every REST route (see AuthGuard): only an approved,
   * logged-in session may open this socket. The ws adapter hands us the raw
   * upgrade request as the second argument, which is where the session
   * cookie lives -- there's no Express request/cookie-parser in this path.
   */
  async handleConnection(client: any, request?: IncomingMessage) {
    const token = parseCookie(request?.headers?.cookie, SESSION_COOKIE);
    const payload = token ? this.auth.verifySessionToken(token) : null;
    const user = payload ? await this.auth.findUserById(payload.userId) : null;

    if (!user || user.status !== 'APPROVED') {
      this.logger.warn('rejecting websocket connection: no approved session');
      client.close();
      return;
    }

    this.clients.add(client);
    this.logger.log(`client connected (${this.clients.size} total)`);
  }

  handleDisconnect(client: any) {
    this.clients.delete(client);
    this.logger.log(`client disconnected (${this.clients.size} total)`);
  }

  broadcast(event: ServerEvent) {
    const data = JSON.stringify(event);
    for (const client of this.clients) {
      // readyState 1 === OPEN
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }
}
