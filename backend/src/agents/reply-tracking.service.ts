import { Injectable, Logger } from '@nestjs/common';
import { MessengerService } from '../messenger/messenger.service';

/**
 * Shared reply-tracking infra used by every BotAgent. Extracted from
 * WebhookService so any agent (default commerce, university, future types)
 * can send a Messenger reply and have it captured for conversation history
 * without agents depending on each other or on WebhookService internals.
 */
@Injectable()
export class ReplyTrackingService {
  private readonly logger = new Logger(ReplyTrackingService.name);

  // Tracks the last reply sent per pageId:psid during a processMessage call
  private readonly inFlightReply = new Map<string, string>();
  // Maps psid → active replyKey (pageId:psid) so safeSend can use the correct key
  private readonly activeReplyKey = new Map<string, string>();

  constructor(private readonly messenger: MessengerService) {}

  /** Clear any stale reply tracking for this page+psid before processing. */
  beginTracking(pageId: number, psid: string): void {
    const replyKey = `${pageId}:${psid}`;
    this.inFlightReply.delete(replyKey);
    this.activeReplyKey.set(psid, replyKey);
  }

  /** Safe sendText — logs error but does not throw. Records the reply for history tracking. */
  async safeSend(token: string, psid: string, text: string): Promise<void> {
    try {
      await this.messenger.sendText(token, psid, text);
      const key = this.activeReplyKey.get(psid) ?? psid;
      this.inFlightReply.set(key, text); // track last reply for history
    } catch (err) {
      this.logger.error(`[ReplyTracking] safeSend failed psid=${psid}: ${err}`);
    }
  }

  /** Returns and clears the last reply recorded for this pageId:psid, if any. */
  takeLastReply(pageId: number, psid: string): string | null {
    const replyKey = `${pageId}:${psid}`;
    const reply = this.inFlightReply.get(replyKey) ?? null;
    this.inFlightReply.delete(replyKey);
    return reply;
  }

  endTracking(psid: string): void {
    this.activeReplyKey.delete(psid);
  }

  /**
   * Raw lookup by plain psid (not pageId:psid). Preserved as-is from the
   * original WebhookService code for exact behavior parity — entries are
   * actually stored under the composite pageId:psid key (see safeSend), so
   * this pre-existing lookup path was already a no-op in practice.
   */
  peekByPsid(psid: string): string | null {
    return this.inFlightReply.get(psid) ?? null;
  }
}
