import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DISCORD_SLASH_COMMANDS } from './discord-bot';
import { isPlatformEnabled } from '../../config/platforms.config';

@Injectable()
export class DiscordBotInitService implements OnModuleInit {
  private readonly logger = new Logger(DiscordBotInitService.name);
  private readonly botToken: string;
  private readonly clientId: string;

  constructor() {
    this.botToken = process.env.DISCORD_BOT_TOKEN || '';
    this.clientId = process.env.DISCORD_CLIENT_ID || '';
  }

  async onModuleInit() {
    if (!isPlatformEnabled('discord')) {
      this.logger.log('discord is not in ENABLED_PLATFORMS; slash commands not registered.');
      return;
    }

    if (!this.botToken || !this.clientId) {
      this.logger.warn('Discord bot credentials not configured. Skipping Discord bot initialization.');
      return;
    }

    try {
      await this.registerGlobalCommands();
      this.logger.log('Discord slash commands registered successfully');
    } catch (error: any) {
      this.logger.error(`Failed to register Discord slash commands: ${error.message}`);
    }
  }

  async registerGlobalCommands(): Promise<void> {
    const url = `https://discord.com/api/v10/applications/${this.clientId}/commands`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(DISCORD_SLASH_COMMANDS),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${error}`);
    }

    const commands = await response.json();
    this.logger.log(`Registered ${commands.length} Discord slash commands`);
  }

  async registerGuildCommands(guildId: string): Promise<void> {
    const url = `https://discord.com/api/v10/applications/${this.clientId}/guilds/${guildId}/commands`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(DISCORD_SLASH_COMMANDS),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${error}`);
    }

    const commands = await response.json();
    this.logger.log(`Registered ${commands.length} Discord slash commands for guild ${guildId}`);
  }
}
