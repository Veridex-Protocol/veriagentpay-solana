export const TELEGRAM_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: '💳 Wallet' }, { text: '💸 Send' }, { text: '📊 Split' }],
    [{ text: '🧧 Red Envelope' }, { text: '🎯 Save AI' }, { text: '🎁 Refer & Earn' }],
    [{ text: '🔄 Subscriptions' }, { text: '🔑 Session Keys' }, { text: 'ℹ️ Help' }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

export function getTelegramInlineKeyboard(miniAppUrl: string, params?: { action?: string; amount?: number; to?: string; token?: string }) {
  let url = `${miniAppUrl}${params?.action ? '/pay' : '/dashboard'}`;
  if (params?.action) {
    url += `?action=${params.action}&amount=${params.amount || 0}&to=${params.to || ''}&token=${params.token || 'USDC'}`;
  }

  return {
    inline_keyboard: [
      [
        { text: '💳 Open Wallet Mini App', web_app: { url } },
        { text: '🔗 Open in Browser', url } // Fallback for legacy Telegram clients
      ],
      [
        { text: '💵 Pay USDC', callback_data: `TOKEN_SELECT:USDC:${params?.amount || 10}` },
        { text: '🪙 Pay USDT', callback_data: `TOKEN_SELECT:USDT:${params?.amount || 10}` },
        { text: '⚡ Pay BOT', callback_data: `TOKEN_SELECT:BOT:${params?.amount || 10}` }
      ]
    ]
  };
}
