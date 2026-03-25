import { Injectable, Logger } from '@nestjs/common';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);

  constructor(private readonly encryption: EncryptionService) {}

  /**
   * Send a text message via Facebook Messenger Send API.
   * pageToken may be encrypted (ENC:...) — we decrypt before using.
   */
  async sendText(pageToken: string, psid: string, text: string): Promise<void> {
    if (!pageToken || !psid || !text) {
      this.logger.warn(
        `[Messenger] sendText called with missing params: psid=${psid}`,
      );
      return;
    }

    // SECURITY: decrypt token if it was stored encrypted
    const rawToken = this.encryption.decrypt(pageToken);

    const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(rawToken)}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: psid }, message: { text } }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        this.logger.error(
          `[Messenger] Send failed status=${res.status} psid=${psid} body=${errText}`,
        );
      } else {
        this.logger.debug(
          `[Messenger] Sent to psid=${psid} text_len=${text.length}`,
        );
      }
    } catch (err) {
      this.logger.error(`[Messenger] Network error psid=${psid}: ${err}`);
      throw err;
    }
  }
}
