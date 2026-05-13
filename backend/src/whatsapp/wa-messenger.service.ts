import { Injectable, Logger } from '@nestjs/common';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [1000, 2000, 4000];

@Injectable()
export class WaMessengerService {
  private readonly logger = new Logger(WaMessengerService.name);

  /**
   * Send a text message via WhatsApp Cloud API.
   * phoneNumberId: Meta phone number ID
   * rawToken: decrypted WA access token
   * to: recipient wa_id (phone number e.g. "8801712345678")
   */
  async sendText(
    phoneNumberId: string,
    rawToken: string,
    to: string,
    text: string,
  ): Promise<void> {
    if (!phoneNumberId || !rawToken || !to || !text) {
      this.logger.warn(`[WaMessenger] sendText called with missing params to=${to}`);
      return;
    }

    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${rawToken}`,
          },
          body,
        });

        if (res.ok) {
          this.logger.debug(`[WaMessenger] Sent to=${to} len=${text.length}`);
          return;
        }

        const errText = await res.text().catch(() => '');

        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS[attempt];
          this.logger.warn(
            `[WaMessenger] status=${res.status} to=${to} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        this.logger.error(
          `[WaMessenger] Send failed status=${res.status} to=${to} body=${errText.slice(0, 200)}`,
        );
        return;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS[attempt];
          this.logger.warn(
            `[WaMessenger] Network error to=${to} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
        } else {
          this.logger.error(`[WaMessenger] Network error to=${to} (exhausted): ${err}`);
        }
      }
    }
  }
}
