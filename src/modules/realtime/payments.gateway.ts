import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenServicePort } from '@modules/identity/application/ports/token.service.port';
import {
  PaymentConfirmedEvent,
  PaymentEventsPublisher,
} from './payment-events.port';

function merchantRoom(merchantId: string): string {
  return `merchant:${merchantId}`;
}

/**
 * One room per merchant, joined only after the connecting socket presents
 * a valid access token naming that merchant — a client can never join an
 * arbitrary merchant's room by guessing an ID, since room membership is
 * derived from the verified JWT, not a client-supplied parameter.
 *
 * CORS origin is read directly from process.env here rather than via
 * ConfigService — @WebSocketGateway's options are evaluated once at class
 * decoration time, before Nest's DI container (and ConfigModule) exists,
 * so there's no constructor-time hook to source it from the same place
 * main.ts does. Keep this in sync with CORS_ORIGIN by hand.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class PaymentsGateway
  extends PaymentEventsPublisher
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PaymentsGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(private readonly tokens: TokenServicePort) {
    super();
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      if (payload.type !== 'access') {
        client.disconnect(true);
        return;
      }
      const merchantId = payload.merchantId as string | undefined;
      if (merchantId) {
        await client.join(merchantRoom(merchantId));
      }
      // Back-office users (no merchantId on the token) stay connected but
      // join no room yet — they receive nothing until a per-merchant
      // subscribe flow exists. Not a gap in this event's security model,
      // just not built out.
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Nothing to clean up — socket.io removes room membership automatically.
  }

  publishPaymentConfirmed(
    merchantId: string,
    event: PaymentConfirmedEvent,
  ): void {
    if (!this.server) {
      this.logger.warn(
        'publishPaymentConfirmed called before gateway server was ready',
      );
      return;
    }
    this.server.to(merchantRoom(merchantId)).emit('payment.confirmed', event);
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
    return undefined;
  }
}
