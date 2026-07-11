import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface OrderActionPayload {
  orderId: number;
  pageId: number;
  action: 'reject';
  exp: number;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// HMAC-signed, stateless opaque tokens for owner-facing order actions
// triggered from email links (no login). Mirrors FacebookService's
// buildSignedState pattern — never reuse Order.editToken here, that
// capability is handed to the customer, not the owner.
@Injectable()
export class OrderActionTokenService {
  private readonly secret =
    process.env.ORDER_MAIL_ACTION_SECRET ||
    process.env.FB_APP_SECRET ||
    'dfbot_order_action_secret';

  build(payload: Pick<OrderActionPayload, 'orderId' | 'pageId' | 'action'>, ttlMs = DEFAULT_TTL_MS): string {
    const full: OrderActionPayload = { ...payload, exp: Date.now() + ttlMs };
    const body = Buffer.from(JSON.stringify(full)).toString('base64url');
    const sig = crypto.createHmac('sha256', this.secret).update(body).digest('hex');
    return `${body}.${sig}`;
  }

  verify(token: string): OrderActionPayload {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) throw new Error('Invalid token');

    const expected = crypto.createHmac('sha256', this.secret).update(body).digest('hex');
    const sigOk =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!sigOk) throw new Error('Invalid token signature');

    let decoded: OrderActionPayload;
    try {
      decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Malformed token');
    }
    if (!decoded.exp || Date.now() > decoded.exp) throw new Error('Token expired');
    return decoded;
  }
}
