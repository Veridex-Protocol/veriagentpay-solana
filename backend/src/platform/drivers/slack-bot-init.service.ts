import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isPlatformEnabled } from '../../config/platforms.config';

@Injectable()
export class SlackBotInitService implements OnModuleInit {
  private readonly logger = new Logger(SlackBotInitService.name);
  private readonly botToken: string;
  private readonly signingSecret: string;

  constructor() {
    this.botToken = process.env.SLACK_BOT_TOKEN || '';
    this.signingSecret = process.env.SLACK_SIGNING_SECRET || '';
  }

  async onModuleInit() {
    if (!isPlatformEnabled('slack')) {
      this.logger.log('slack is not in ENABLED_PLATFORMS; bot not initialized.');
      return;
    }

    if (!this.botToken || !this.signingSecret) {
      this.logger.warn('Slack bot credentials not configured. Skipping Slack bot initialization.');
      return;
    }

    try {
      await this.testAuthentication();
      this.logger.log('Slack bot initialized successfully');
    } catch (error: any) {
      this.logger.error(`Failed to initialize Slack bot: ${error.message}`);
    }
  }

  async testAuthentication(): Promise<void> {
    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack authentication failed: ${data.error}`);
    }

    this.logger.log(`Slack bot connected as ${data.user} in workspace ${data.team}`);
  }

  async sendMessage(channel: string, text: string, blocks?: any[]): Promise<void> {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        text,
        blocks,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack message send failed: ${data.error}`);
    }
  }
}
