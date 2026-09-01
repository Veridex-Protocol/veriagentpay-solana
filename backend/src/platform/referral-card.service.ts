import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';

export interface ReferralCard {
  code: string;
  shareUrl: string;
  totalReferrals: number;
  totalPoints: number;
  qrBuffer: Buffer;
  qrImageUrl: string;
  caption: string;
}

@Injectable()
export class ReferralCardService {
  private readonly logger = new Logger(ReferralCardService.name);

  /**
   * Generate high-res QR code PNG buffer and public URL fallback
   */
  async generateCard(code: string, shareUrl: string, totalReferrals: number = 0, totalPoints: number = 0): Promise<ReferralCard> {
    const qrBuffer = await QRCode.toBuffer(shareUrl, {
      type: 'png',
      margin: 2,
      width: 400,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(shareUrl)}`;

    const caption =
      `🎁 *Refer & Earn VERI Points!*\n\n` +
      `Scan the QR code above or share your unique invite link:\n` +
      `\`${shareUrl}\`\n\n` +
      `• *Your Invite Code:* \`${code}\`\n` +
      `• *Total Referrals:* ${totalReferrals}\n` +
      `• *Points Earned:* ${totalPoints} VERI\n\n` +
      `🚀 *Earn 100 VERI Points* for every friend who activates their biometric passkey!`;

    return {
      code,
      shareUrl,
      totalReferrals,
      totalPoints,
      qrBuffer,
      qrImageUrl,
      caption,
    };
  }
}
