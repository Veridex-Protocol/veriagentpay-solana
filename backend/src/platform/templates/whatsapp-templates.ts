export function getWhatsAppInteractiveListMenu(recipientPhone: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'VeriAgent Pay' },
      body: { text: 'Select an action or send natural language commands like "Send 50 USDT to @alice":' },
      footer: { text: 'Gasless Biometric Payments on BOTChain' },
      action: {
        button: 'Open Main Menu',
        sections: [
          {
            title: 'Wallet & Info',
            rows: [
              { id: '/wallet', title: '💳 Wallet', description: 'Open wallet dashboard & passkey controls' },
              { id: '/dashboard', title: '🖥️ Dashboard', description: 'Manage wallet and session-key safety limits' },
              { id: '/balance', title: '💰 Balance', description: 'View your token balances on BOTChain' },
              { id: '/history', title: '📜 History', description: 'View recent transactions & activity' },
            ]
          },
          {
            title: 'Payments & Splits',
            rows: [
              { id: '/pay', title: '💸 Send Money', description: 'Pay a social contact (USDC, USDT, BOT)' },
              { id: '/request', title: '📥 Request Money', description: 'Request payment from friends' },
              { id: '/split', title: '🧾 Split Bill', description: 'Divide group expenses' },
              { id: '/envelope', title: '🧧 Red Envelope', description: 'Send lucky money (Hongbao)' },
            ]
          },
          {
            title: 'Savings, Pools & Rewards',
            rows: [
              { id: '/pools', title: '👥 Group Pools', description: 'Peer credit lines & vault deposits' },
              { id: '/save', title: '🏦 Save (Soon)', description: 'AI yield vault (Coming Soon)' },
              { id: '/referral', title: '🎁 Refer & Earn', description: 'Invite friends & earn VERI points' },
            ]
          }
        ]
      }
    }
  };
}

export function getWhatsAppButtonConfirmation(recipientPhone: string, title: string, bodyText: string, buttons: { id: string; title: string }[]) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'text', text: title },
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) }
        }))
      }
    }
  };
}
