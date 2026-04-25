import { Injectable, Logger } from '@nestjs/common';
import { EncryptionService } from '../common/encryption.service';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [1000, 2000, 4000]; // exponential backoff

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);

  constructor(private readonly encryption: EncryptionService) {}

  /**
   * Send a text message via Facebook Messenger Send API.
   * Retries up to 3× on 429 (rate limit) or 5xx errors with exponential backoff.
   */
  async sendText(pageToken: string, psid: string, text: string): Promise<void> {
    if (!pageToken || !psid || !text) {
      this.logger.warn(`[Messenger] sendText called with missing params: psid=${psid}`);
      return;
    }

    const rawToken = this.encryption.decrypt(pageToken);
    const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(rawToken)}`;
    const body = JSON.stringify({ recipient: { id: psid }, message: { text } });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (res.ok) {
          this.logger.debug(`[Messenger] Sent psid=${psid} len=${text.length}`);
          return;
        }

        const errText = await res.text().catch(() => '');

        // Rate limited or server error — retry with backoff
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS[attempt];
          this.logger.warn(
            `[Messenger] status=${res.status} psid=${psid} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`,
          );
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // 4xx (except 429) or exhausted retries — log and give up
        this.logger.error(
          `[Messenger] Send failed status=${res.status} psid=${psid} body=${errText.slice(0, 200)}`,
        );
        return;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS[attempt];
          this.logger.warn(`[Messenger] Network error psid=${psid} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          this.logger.error(`[Messenger] Network error psid=${psid} (exhausted retries): ${err}`);
        }
      }
    }
  }
}
