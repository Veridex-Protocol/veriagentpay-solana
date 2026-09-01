import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/secrets';
import * as crypto from 'crypto';

export interface SlackTokenResponse {
  ok: boolean;
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id: string;
  app_id: string;
  team: {
    name: string;
    id: string;
  };
  authed_user: {
    id: string;
    scope: string;
    access_token: string;
    token_type: string;
  };
}

export interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  profile: {
    email?: string;
    image_512?: string;
  };
}

@Injectable()
export class SlackOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly prisma: PrismaService,
  ) {
    this.clientId = process.env.SLACK_CLIENT_ID || '';
    this.clientSecret = process.env.SLACK_CLIENT_SECRET || '';
    this.redirectUri = process.env.SLACK_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/slack/callback`;
  }

  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      user_scope: 'identity.basic,identity.email,identity.avatar',
      state: state || '',
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<SlackTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Slack OAuth credentials not configured');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
    });

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new UnauthorizedException(`Slack token exchange failed: ${error}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new UnauthorizedException(`Slack API error: ${data.error}`);
    }

    return data;
  }

  async getSlackUser(userAccessToken: string): Promise<{ ok: boolean; user: SlackUser }> {
    const response = await fetch('https://slack.com/api/users.identity', {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Failed to fetch Slack user');
    }

    const data = await response.json();
    if (!data.ok) {
      throw new UnauthorizedException(`Slack API error: ${data.error}`);
    }

    return data;
  }

  async handleOAuthCallback(code: string): Promise<{ user: any; jwt: string }> {
    const tokenResponse = await this.exchangeCodeForToken(code);
    const slackUser = await this.getSlackUser(tokenResponse.authed_user.access_token);

    // Find or create user by Slack ID
    let user = await this.prisma.user.findFirst({
      where: { slackId: slackUser.user.id },
      include: { smartWallet: true },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          slackId: slackUser.user.id,
          username: slackUser.user.name,
          email: slackUser.user.profile?.email,
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
        slackId: user.slackId,
        jti: crypto.randomUUID(),
      },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
  }
}
