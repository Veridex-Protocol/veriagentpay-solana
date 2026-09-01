import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/secrets';
import * as crypto from 'crypto';

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  verified?: boolean;
}

@Injectable()
export class DiscordOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly prisma: PrismaService,
  ) {
    this.clientId = process.env.DISCORD_CLIENT_ID || '';
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET || '';
    this.redirectUri = process.env.DISCORD_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/discord/callback`;
  }

  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify email',
      state: state || '',
    });

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<DiscordTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Discord OAuth credentials not configured');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new UnauthorizedException(`Discord token exchange failed: ${error}`);
    }

    return await response.json();
  }

  async getDiscordUser(accessToken: string): Promise<DiscordUser> {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Failed to fetch Discord user');
    }

    return await response.json();
  }

  async handleOAuthCallback(code: string): Promise<{ user: any; jwt: string }> {
    const tokenResponse = await this.exchangeCodeForToken(code);
    const discordUser = await this.getDiscordUser(tokenResponse.access_token);

    // Find or create user by Discord ID
    let user = await this.prisma.user.findFirst({
      where: { discordId: discordUser.id },
      include: { smartWallet: true },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          discordId: discordUser.id,
          username: discordUser.username,
          email: discordUser.email,
        },
        include: { smartWallet: true },
      });
    }

    const token = await this.generateJWT(user);
    return { user, jwt: token };
  }

  private async generateJWT(user: any): Promise<string> {
    return jwt.sign(
      {
        userId: user.id,
        walletAddress: user.smartWallet?.address || null,
        email: user.email || null,
        discordId: user.discordId,
        jti: crypto.randomUUID(),
      },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
  }
}
