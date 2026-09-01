import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/secrets';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    const address =
      client.handshake.headers['x-wallet-address'] ||
      client.handshake.query?.address ||
      'anonymous';

    const room = `user:${address}`;
    client.join(room);

    // Notifications are persisted by authenticated User.id while deposit
    // events are keyed by public wallet address. Join both rooms, deriving the
    // user id only from the verified signed access token (never from a client
    // supplied query value).
    const accessToken = typeof client.handshake.auth?.token === 'string'
      ? client.handshake.auth.token
      : null;
    if (accessToken) {
      try {
        const payload = jwt.verify(accessToken, JWT_SECRET) as { userId?: string };
        if (payload.userId) client.join(`user:${payload.userId}`);
      } catch {
        this.logger.debug(`Socket ${client.id} connected without a valid access token`);
      }
    }

    this.logger.log(`Client connected: ${client.id} joined wallet room ${room}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() data: { address: string },
    @ConnectedSocket() client: Socket
  ) {
    if (data?.address) {
      const room = `user:${data.address}`;
      client.join(room);
      this.logger.log(`Client ${client.id} joined room ${room}`);
    }
  }

  emitToUser(userIdOrAddress: string, event: string, payload: any) {
    const room = `user:${userIdOrAddress}`;
    if (this.server) {
      this.server.to(room).emit(event, payload);
    }
  }
}
