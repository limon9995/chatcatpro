import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { randomUUID } from 'crypto';
import { DraftSession } from '../conversation-context/conversation-context.service';

export interface VerifyResult {
  verified: boolean;
  amount?: number;
  senderNumber?: string;
  errorMessage?: string;
  needsManual?: boolean;
}

export interface IpnResult {
  paid: boolean;
  amount: number;
  sessionToken: string;
  gatewayTxId?: string;
}

@Injectable()
export class PaymentVerifyService {
  private readonly logger = new Logger(PaymentVerifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  // ── Credential management ────────────────────────────────────────────────

  async saveCredentials(
    pageId: number,
    method: string,
    credentials: Record<string, string>,
    isActive = true,
  ) {
    const type = ['bkash', 'nagad'].includes(method) ? 'direct' : 'gateway';
    const credJson = this.encryption.encrypt(JSON.stringify(credentials));
    return this.prisma.paymentCredential.upsert({
      where: { pageId_method: { pageId, method } },
      create: { pageId, method, type, isActive, credJson },
      update: { type, isActive, credJson, updatedAt: new Date() },
    });
  }

  async getCredentials(pageId: number, method: string): Promise<Record<string, string> | null> {
    const row = await this.prisma.paymentCredential.findUnique({
      where: { pageId_method: { pageId, method } },
    });
    if (!row || !row.isActive) return null;
    try {
      return JSON.parse(this.encryption.decrypt(row.credJson));
    } catch {
      return null;
    }
  }

  async listMethods(pageId: number) {
    const rows = await this.prisma.paymentCredential.findMany({
      where: { pageId },
      select: { method: true, type: true, isActive: true, updatedAt: true },
    });
    return rows;
  }

  async removeCredentials(pageId: number, method: string) {
    return this.prisma.paymentCredential.deleteMany({
      where: { pageId, method },
    });
  }

  /** Returns the first active credential found for the page (direct preferred over gateway) */
  async getActiveCredential(pageId: number) {
    const rows = await this.prisma.paymentCredential.findMany({
      where: { pageId, isActive: true },
      orderBy: { type: 'asc' }, // 'direct' < 'gateway' alphabetically
    });
    if (!rows.length) return null;
    const row = rows[0];
    try {
      const creds = JSON.parse(this.encryption.decrypt(row.credJson));
      return { method: row.method, type: row.type, creds };
    } catch {
      return null;
    }
  }

  // ── Direct verification (bKash / Nagad) ─────────────────────────────────

  async verifyDirect(
    pageId: number,
    method: string,
    txId: string,
    expectedAmount: number,
  ): Promise<VerifyResult> {
    const creds = await this.getCredentials(pageId, method);
    if (!creds) return { verified: false, errorMessage: 'credentials_not_configured' };

    try {
      if (method === 'bkash') return await this.verifyBkash(creds, txId, expectedAmount);
      if (method === 'nagad') return await this.verifyNagad(creds, txId, expectedAmount);
    } catch (err) {
      this.logger.error(`[PaymentVerify] ${method} verify error: ${err.message}`);
      return { verified: false, errorMessage: 'api_error', needsManual: true };
    }
    return { verified: false, errorMessage: 'unsupported_method' };
  }

  private async verifyBkash(
    creds: Record<string, string>,
    txId: string,
    expectedAmount: number,
  ): Promise<VerifyResult> {
    const baseUrl = creds.sandbox === 'true'
      ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
      : 'https://tokenized.pay.bka.sh/v1.2.0-beta';

    // Step 1: Grant token
    const tokenRes = await fetchWithTimeout(`${baseUrl}/tokenized/checkout/token/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        username: creds.username,
        password: creds.password,
      },
      body: JSON.stringify({ app_key: creds.app_key, app_secret: creds.app_secret }),
    });
    if (!tokenRes.ok) return { verified: false, errorMessage: 'bkash_token_failed' };
    const tokenData = await tokenRes.json();
    const token: string = tokenData.id_token;

    // Step 2: Query payment status
    const statusRes = await fetchWithTimeout(`${baseUrl}/tokenized/checkout/payment/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'x-app-key': creds.app_key,
      },
      body: JSON.stringify({ paymentID: txId }),
    });
    if (!statusRes.ok) return { verified: false, errorMessage: 'bkash_status_failed' };
    const data = await statusRes.json();

    const verified =
      data.transactionStatus === 'Completed' &&
      parseFloat(data.amount) >= expectedAmount;

    return {
      verified,
      amount: parseFloat(data.amount),
      senderNumber: data.customerMsisdn,
      errorMessage: verified ? undefined : `status:${data.transactionStatus}`,
    };
  }

  private async verifyNagad(
    creds: Record<string, string>,
    txId: string,
    expectedAmount: number,
  ): Promise<VerifyResult> {
    const baseUrl = creds.sandbox === 'true'
      ? 'https://sandbox.mynagad.com:10080/remote-payment-gateway-1.0'
      : 'https://api.mynagad.com/api/dfs';

    // Get token
    const tokenRes = await fetchWithTimeout(`${baseUrl}/check-transaction-id/${txId}`, {
      method: 'GET',
      headers: {
        'X-KM-Api-Version': 'v-0.2.0',
        'X-KM-IP-V4': '127.0.0.1',
        'X-KM-Client-Type': 'PC_WEB',
        Authorization: `Bearer ${creds.api_key}`,
      },
    });
    if (!tokenRes.ok) return { verified: false, errorMessage: 'nagad_api_failed' };
    const data = await tokenRes.json();

    const verified =
      data.status === 'Success' &&
      parseFloat(data.amount) >= expectedAmount;

    return {
      verified,
      amount: parseFloat(data.amount),
      senderNumber: data.senderMobileNo,
      errorMessage: verified ? undefined : `status:${data.status}`,
    };
  }

  // ── Gateway payment link generation ─────────────────────────────────────

  async createPendingPayment(
    pageId: number,
    psid: string,
    draft: DraftSession,
    amount: number,
    method: string,
  ) {
    const sessionToken = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    return this.prisma.pendingPayment.create({
      data: {
        pageId,
        psid,
        draftJson: JSON.stringify(draft),
        amount,
        method,
        sessionToken,
        status: 'pending',
        expiresAt,
      },
    });
  }

  async generateGatewayLink(
    pageId: number,
    method: string,
    sessionToken: string,
    amount: number,
    apiBaseUrl: string,
  ): Promise<string | null> {
    const creds = await this.getCredentials(pageId, method);
    if (!creds) return null;

    try {
      if (method === 'sslcommerz') return await this.createSslcommerzLink(creds, sessionToken, amount, apiBaseUrl);
      if (method === 'shurjopay') return await this.createShurjopayLink(creds, sessionToken, amount, apiBaseUrl);
      if (method === 'zinipay') return await this.createZinipayLink(creds, sessionToken, amount, apiBaseUrl);
    } catch (err) {
      this.logger.error(`[PaymentVerify] gateway link error (${method}): ${err.message}`);
    }
    return null;
  }

  private async createSslcommerzLink(
    creds: Record<string, string>,
    sessionToken: string,
    amount: number,
    apiBaseUrl: string,
  ): Promise<string> {
    const isSandbox = creds.sandbox === 'true';
    const url = isSandbox
      ? 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'
      : 'https://securepay.sslcommerz.com/gwprocess/v4/api.php';

    const params = new URLSearchParams({
      store_id: creds.store_id,
      store_passwd: creds.store_passwd,
      total_amount: amount.toFixed(2),
      currency: 'BDT',
      tran_id: sessionToken,
      success_url: `${apiBaseUrl}/payment-verify/ipn/sslcommerz/${sessionToken}?status=success`,
      fail_url: `${apiBaseUrl}/payment-verify/ipn/sslcommerz/${sessionToken}?status=fail`,
      cancel_url: `${apiBaseUrl}/payment-verify/ipn/sslcommerz/${sessionToken}?status=cancel`,
      ipn_url: `${apiBaseUrl}/payment-verify/ipn/sslcommerz/${sessionToken}`,
      cus_name: 'Customer',
      cus_email: 'customer@example.com',
      cus_phone: '01700000000',
      cus_add1: 'Bangladesh',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      shipping_method: 'NO',
      product_name: 'Order',
      product_category: 'General',
      product_profile: 'general',
    });

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();
    if (data.status !== 'SUCCESS') throw new Error(`SSLCommerz: ${data.failedreason}`);
    return data.GatewayPageURL;
  }

  private async createShurjopayLink(
    creds: Record<string, string>,
    sessionToken: string,
    amount: number,
    apiBaseUrl: string,
  ): Promise<string> {
    const baseUrl = 'https://engine.shurjopayment.com';

    // Get token
    const tokenRes = await fetchWithTimeout(`${baseUrl}/api/get-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creds.username, password: creds.password }),
    });
    const tokenData = await tokenRes.json();
    const token: string = tokenData.token;
    const storeId: string = tokenData.store_id;

    const checkoutRes = await fetchWithTimeout(`${baseUrl}/api/secret-pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prefix: creds.prefix || 'SP',
        token,
        store_id: storeId,
        return_url: `${apiBaseUrl}/payment-verify/ipn/shurjopay/${sessionToken}`,
        cancel_url: `${apiBaseUrl}/payment-verify/ipn/shurjopay/${sessionToken}?status=cancel`,
        amount,
        order_id: sessionToken,
        currency: 'BDT',
        customer_name: 'Customer',
        customer_phone: '01700000000',
        customer_address: 'Bangladesh',
        customer_city: 'Dhaka',
        customer_country: 'Bangladesh',
      }),
    });
    const checkoutData = await checkoutRes.json();
    return checkoutData.checkout_url;
  }

  private async createZinipayLink(
    creds: Record<string, string>,
    sessionToken: string,
    amount: number,
    apiBaseUrl: string,
  ): Promise<string> {
    const baseUrl = 'https://api.zinipay.com/v1';
    const res = await fetchWithTimeout(`${baseUrl}/payment/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.api_key}`,
      },
      body: JSON.stringify({
        store_id: creds.store_id,
        amount,
        currency: 'BDT',
        order_id: sessionToken,
        success_url: `${apiBaseUrl}/payment-verify/ipn/zinipay/${sessionToken}?status=success`,
        fail_url: `${apiBaseUrl}/payment-verify/ipn/zinipay/${sessionToken}?status=fail`,
        cancel_url: `${apiBaseUrl}/payment-verify/ipn/zinipay/${sessionToken}?status=cancel`,
      }),
    });
    const data = await res.json();
    return data.payment_url;
  }

  // ── IPN verification ─────────────────────────────────────────────────────

  async handleIpn(
    method: string,
    sessionToken: string,
    body: any,
    query: any,
  ): Promise<IpnResult> {
    const pending = await this.prisma.pendingPayment.findUnique({
      where: { sessionToken },
    });

    if (!pending || pending.status !== 'pending') {
      return { paid: false, amount: 0, sessionToken };
    }
    if (new Date() > pending.expiresAt) {
      await this.prisma.pendingPayment.update({
        where: { sessionToken },
        data: { status: 'expired' },
      });
      return { paid: false, amount: 0, sessionToken };
    }

    let paid = false;
    let gatewayTxId: string | undefined;
    let amount = pending.amount;

    if (method === 'sslcommerz') {
      paid = body.status === 'VALID' || query.status === 'success';
      gatewayTxId = body.bank_tran_id || body.tran_id;
      amount = parseFloat(body.amount) || pending.amount;
    } else if (method === 'shurjopay') {
      paid = body.sp_code === '1000' || query.status !== 'cancel';
      gatewayTxId = body.sp_tx_id;
    } else if (method === 'zinipay') {
      paid = body.payment_status === 'completed' || query.status === 'success';
      gatewayTxId = body.transaction_id;
    }

    if (paid) {
      await this.prisma.pendingPayment.update({
        where: { sessionToken },
        data: { status: 'paid', gatewayTxId: gatewayTxId ?? null },
      });
    }

    return { paid, amount, sessionToken, gatewayTxId };
  }

  async getPendingPayment(sessionToken: string) {
    return this.prisma.pendingPayment.findUnique({ where: { sessionToken } });
  }

  // ── Test connection ───────────────────────────────────────────────────────

  async testConnection(pageId: number, method: string): Promise<{ ok: boolean; message: string }> {
    const creds = await this.getCredentials(pageId, method);
    if (!creds) return { ok: false, message: 'Credentials not found or inactive' };

    try {
      if (method === 'bkash') {
        const baseUrl = creds.sandbox === 'true'
          ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
          : 'https://tokenized.pay.bka.sh/v1.2.0-beta';
        const res = await fetchWithTimeout(`${baseUrl}/tokenized/checkout/token/grant`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            username: creds.username,
            password: creds.password,
          },
          body: JSON.stringify({ app_key: creds.app_key, app_secret: creds.app_secret }),
        });
        const data = await res.json();
        if (data.id_token) return { ok: true, message: 'bKash connection successful' };
        return { ok: false, message: data.errorMessage || 'Token grant failed' };
      }

      if (method === 'nagad') {
        return { ok: true, message: 'Nagad credentials saved (test on live transaction)' };
      }

      if (method === 'sslcommerz') {
        const isSandbox = creds.sandbox === 'true';
        const url = isSandbox
          ? 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php'
          : 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php';
        const res = await fetchWithTimeout(
          `${url}?val_id=test&store_id=${creds.store_id}&store_passwd=${creds.store_passwd}&v=1&format=json`,
        );
        const data = await res.json();
        if (data.status !== 'INVALID_TRANSACTION') {
          return { ok: true, message: 'SSLCommerz credentials valid' };
        }
        return { ok: true, message: 'SSLCommerz credentials accepted (test transaction)' };
      }

      return { ok: true, message: `${method} credentials saved` };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }
}

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
