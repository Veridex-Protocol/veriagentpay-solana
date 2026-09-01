import { Injectable, Logger } from '@nestjs/common';
import { PoolsService } from '../pools/pools.service';
import { toUserMessage } from '../common/user-error.util';

export interface TelegramPoolCommandPayload {
  chatId: string;
  userIdentifier: string;
  commandText: string;
}

@Injectable()
export class TelegramPoolDriver {
  private readonly logger = new Logger(TelegramPoolDriver.name);

  constructor(private readonly poolsService: PoolsService) {}

  /**
   * Parses and executes Telegram slash command:
   * `/pool create name:"ETH London Builders" amount:25000 token:USDC rate:4.2`
   */
  async handlePoolCommand(payload: TelegramPoolCommandPayload) {
    const { chatId, userIdentifier, commandText } = payload;
    this.logger.log(`Processing Telegram /pool command for ${userIdentifier}: ${commandText}`);

    // Parse parameters
    const nameMatch = commandText.match(/name:\s*"([^"]+)"|name:\s*(\S+)/i);
    const amountMatch = commandText.match(/amount:\s*(\d+(\.\d+)?)/i);
    const tokenMatch = commandText.match(/token:\s*(USDC|USDT|BOT)/i);
    const rateMatch = commandText.match(/rate:\s*(\d+(\.\d+)?)/i);

    const name = nameMatch ? (nameMatch[1] || nameMatch[2]) : 'Group Lending Pool 🏦';
    const targetAmount = amountMatch ? parseFloat(amountMatch[1]) : 25000;
    const token = tokenMatch ? tokenMatch[1].toUpperCase() : 'USDC';
    const interestRate = rateMatch ? parseFloat(rateMatch[1]) : 4.2;

    try {
      const result = await this.poolsService.createPool(userIdentifier, {
        name,
        targetAmount,
        token,
        interestRate,
        members: [userIdentifier],
        inviteMessage: `Join group pool "${name}" on VeriAgent Pay!`,
      });

      const replyText = `🎉 *Group Lending Pool Created!*\n\n` +
        `🏦 *Pool:* ${name}\n` +
        `💰 *Target:* $${targetAmount.toLocaleString()} ${token}\n` +
        `📈 *APY Rate:* ${interestRate}%\n` +
        `🔗 *Invite Deep-Link:* [Join Pool](${result.inviteLink})\n\n` +
        `Share this link in your group chat for 1-tap mobile deposits!`;

      return {
        chatId,
        text: replyText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📲 Join & Deposit', url: result.inviteLink },
              { text: '🔗 Share Link', url: `https://t.me/share/url?url=${encodeURIComponent(result.inviteLink)}&text=${encodeURIComponent(`Join group lending pool "${name}"!`)}` },
            ],
          ],
        },
      };
    } catch (err: any) {
      return {
        chatId,
        text: `❌ Failed to create group pool: ${toUserMessage(err, 'The pool could not be created. Please try again.')}`,
      };
    }
  }
}
