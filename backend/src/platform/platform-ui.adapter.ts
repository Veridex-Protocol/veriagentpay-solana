export interface GenericButton {
  label: string;
  callbackId?: string; // e.g. "env:claim:123"
  url?: string;
  style?: 'primary' | 'danger' | 'secondary';
}

export interface GenericCardPayload {
  title?: string;
  body: string;
  buttons?: GenericButton[][];
}

export class PlatformUiAdapter {
  /**
   * Serialize generic card into Telegram native payload
   */
  static toTelegram(card: GenericCardPayload, isStellar: boolean = false) {
    const networkBadge = isStellar ? '🌐 *[Stellar Network]*\n' : '⛓️ *[BOTChain EVM]*\n';
    const text = card.title ? `*${card.title}*\n${networkBadge}\n${card.body}` : `${networkBadge}${card.body}`;
    const inlineKeyboard: any[][] = [];

    if (card.buttons) {
      for (const row of card.buttons) {
        const telegramRow: any[] = [];
        for (const btn of row) {
          if (btn.callbackId) {
            telegramRow.push({ text: btn.label, callback_data: btn.callbackId });
          } else if (btn.url) {
            telegramRow.push({ text: btn.label, url: btn.url });
          }
        }
        if (telegramRow.length > 0) inlineKeyboard.push(telegramRow);
      }
    }

    return {
      text,
      reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined,
    };
  }

  /**
   * Serialize generic card into Discord native Embed & Component Payload
   */
  static toDiscord(card: GenericCardPayload, isStellar: boolean = false) {
    const networkBadge = isStellar ? '🌐 [Stellar Network]' : '⛓️ [BOTChain EVM]';
    const components: any[] = [];

    if (card.buttons && card.buttons.length > 0) {
      for (const row of card.buttons) {
        const actionRowComponents: any[] = [];
        for (const btn of row) {
          if (btn.callbackId) {
            actionRowComponents.push({
              type: 2,
              style: btn.style === 'danger' ? 4 : btn.style === 'secondary' ? 2 : 1,
              label: btn.label,
              custom_id: btn.callbackId,
            });
          } else if (btn.url) {
            actionRowComponents.push({
              type: 2,
              style: 5,
              label: btn.label,
              url: btn.url,
            });
          }
        }
        if (actionRowComponents.length > 0) {
          components.push({ type: 1, components: actionRowComponents });
        }
      }
    }

    return {
      embeds: [
        {
          title: `${card.title || 'VeriAgent Pay'} ${isStellar ? '🌐 [Stellar]' : '⛓️ [BOTChain]'}`,
          description: card.body,
          color: isStellar ? 0x0d9488 : 0x10b981,
        },
      ],
      components,
    };
  }

  /**
   * Serialize generic card into Slack Block Kit payload
   */
  static toSlack(card: GenericCardPayload) {
    const blocks: any[] = [];

    if (card.title) {
      blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: card.title },
      });
    }

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: card.body },
    });

    if (card.buttons) {
      for (const row of card.buttons) {
        const elements: any[] = [];
        for (const btn of row) {
          if (btn.callbackId) {
            elements.push({
              type: 'button',
              text: { type: 'plain_text', text: btn.label },
              value: btn.callbackId,
              action_id: btn.callbackId.replace(/:/g, '_'),
              style: btn.style === 'danger' ? 'danger' : 'primary',
            });
          } else if (btn.url) {
            elements.push({
              type: 'button',
              text: { type: 'plain_text', text: btn.label },
              url: btn.url,
              style: 'primary',
            });
          }
        }
        if (elements.length > 0) {
          blocks.push({ type: 'actions', elements });
        }
      }
    }

    return { blocks };
  }

  /**
   * Serialize generic card into WhatsApp interactive message payload
   * WhatsApp 3-Button Adaptation Protocol:
   * - <= 3 buttons -> Interactive Reply Buttons (type: "button")
   * - > 3 buttons  -> Interactive List Message (type: "list")
   */
  static toWhatsApp(recipientPhone: string, card: GenericCardPayload) {
    const allButtons: GenericButton[] = [];
    if (card.buttons) {
      for (const row of card.buttons) {
        for (const btn of row) {
          allButtons.push(btn);
        }
      }
    }

    const bodyText = (card.title ? `*${card.title}*\n\n` : '') + card.body;

    if (allButtons.length > 3) {
      return {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: (card.title || 'VeriAgent Pay').slice(0, 60) },
          body: { text: card.body.slice(0, 1024) },
          action: {
            button: 'Select Action',
            sections: [
              {
                title: 'Actions',
                rows: allButtons.slice(0, 10).map((btn) => ({
                  id: btn.callbackId || btn.url || `action_${Math.random().toString(36).substring(7)}`,
                  title: btn.label.slice(0, 24),
                  description: btn.url ? 'Open Link' : 'Execute Action',
                })),
              },
            ],
          },
        },
      };
    } else if (allButtons.length > 0) {
      return {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText.slice(0, 1024) },
          action: {
            buttons: allButtons.map((btn) => ({
              type: 'reply',
              reply: {
                id: btn.callbackId || btn.url || `btn_${Math.random().toString(36).substring(7)}`,
                title: btn.label.slice(0, 20),
              },
            })),
          },
        },
      };
    }

    return {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'text',
      text: { body: bodyText },
    };
  }

  /**
   * Helper to format Referral QR Cards
   */
  static toReferralCard(payload: { code: string; shareUrl: string; totalReferrals: number; totalPoints: number; qrImageUrl: string }) {
    const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(payload.shareUrl)}&text=${encodeURIComponent('Join VeriAgent Pay and claim bonus rewards! 🚀')}`;
    const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join VeriAgent Pay using my invite code ${payload.code}! ` + payload.shareUrl)}`;

    const caption =
      `🎁 *Refer & Earn VERI Points!*\n\n` +
      `Scan the QR code above or share your unique invite link:\n` +
      `\`${payload.shareUrl}\`\n\n` +
      `• *Your Invite Code:* \`${payload.code}\`\n` +
      `• *Total Referrals:* ${payload.totalReferrals}\n` +
      `• *Points Earned:* ${payload.totalPoints} VERI\n\n` +
      `🚀 *Earn 100 VERI Points* for every friend who activates their biometric passkey!`;

    const telegramKeyboard = [
      [
        { text: '📲 Share Invite', url: telegramShareUrl },
        { text: '📋 Copy Code', callback_data: `ref:copy:${payload.code}` },
      ],
      [
        { text: '🏆 Leaderboard', callback_data: 'ref:leaderboard' },
        { text: '🔄 Refresh', callback_data: 'ref:refresh' },
      ],
    ];

    const discordPayload = {
      embeds: [
        {
          title: '🎁 Refer & Earn VERI Points',
          description: caption,
          color: 0xf59e0b,
          image: { url: payload.qrImageUrl },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: '📲 Share Invite', url: twitterShareUrl },
            { type: 2, style: 2, label: '📋 Copy Code', custom_id: `ref:copy:${payload.code}` },
            { type: 2, style: 2, label: '🏆 Leaderboard', custom_id: 'ref:leaderboard' },
            { type: 2, style: 2, label: '🔄 Refresh', custom_id: 'ref:refresh' },
          ],
        },
      ],
    };

    const slackPayload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎁 Refer & Earn VERI Points' },
        },
        {
          type: 'image',
          image_url: payload.qrImageUrl,
          alt_text: 'Referral QR Code',
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: caption },
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '📲 Share Invite' }, url: twitterShareUrl, style: 'primary' },
            { type: 'button', text: { type: 'plain_text', text: '📋 Copy Code' }, value: `ref:copy:${payload.code}`, action_id: `ref_copy_${payload.code}` },
            { type: 'button', text: { type: 'plain_text', text: '🏆 Leaderboard' }, value: 'ref:leaderboard', action_id: 'ref_leaderboard' },
            { type: 'button', text: { type: 'plain_text', text: '🔄 Refresh' }, value: 'ref:refresh', action_id: 'ref_refresh' },
          ],
        },
      ],
    };

    const whatsappPayload = (recipientPhone: string) => ({
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: caption },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `ref:copy:${payload.code}`, title: '📋 Copy Code' } },
            { type: 'reply', reply: { id: 'ref:leaderboard', title: '🏆 Leaderboard' } },
            { type: 'reply', reply: { id: 'ref:refresh', title: '🔄 Refresh' } },
          ],
        },
      },
    });

    return {
      caption,
      telegramKeyboard,
      discordPayload,
      slackPayload,
      whatsappPayload,
      qrImageUrl: payload.qrImageUrl,
    };
  }

  /**
   * Render Multi-Chain Payment Card with Teal Stellar vs Emerald BOTChain Badges
   */
  static toMultiChainPaymentCard(payload: {
    chain: 'STELLAR' | 'BOTCHAIN';
    amount: string;
    token: string;
    recipient: string;
    txHash?: string;
  }) {
    const isStellar = payload.chain === 'STELLAR';
    const chainBadge = isStellar ? '🌐 [Stellar Network]' : '⛓️ [BOTChain L1]';
    const title = `${chainBadge} Payment Sent`;
    const body = `Transferred *${payload.amount} ${payload.token}* to \`${payload.recipient}\` gaslessly.\n\n• *Chain:* ${payload.chain}\n• *Gas Fee:* $0.00 (Sponsored)`;

    const buttons: GenericButton[][] = [
      [
        {
          label: isStellar ? '🌐 Stellar Expert' : '⛓️ Block Explorer',
          url: isStellar
            ? `https://stellar.expert/explorer/public/tx/${payload.txHash || ''}`
            : `https://scan.bohr.life/tx/${payload.txHash || ''}`,
        },
        {
          label: '💵 Cash Out (MoneyGram)',
          callbackId: `cashout:sep24:${payload.amount}`,
        },
      ],
    ];

    return {
      title,
      body,
      buttons,
    };
  }
}
