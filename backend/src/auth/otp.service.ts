import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  } as any);

  constructor(private readonly prisma: PrismaService) {}

  /** Generate and send a 6-digit OTP to the given email. */
  async sendOtp(email: string, purpose: 'signup' | 'reset'): Promise<void> {
    const logoPath = path.join(process.cwd(), 'storage', 'logo.png');
    const logoBase64 = fs.existsSync(logoPath)
      ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
      : '';
    // Remove previous unused OTPs for this email+purpose
    await this.prisma.otpToken.deleteMany({ where: { email, purpose } });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.otpToken.create({
      data: { id: crypto.randomUUID(), email, code, purpose, expiresAt },
    });

    const isSignup = purpose === 'signup';
    await this.transporter.sendMail({
      from: `"ChatCat Pro" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: isSignup
        ? 'ChatCat Pro — Email Verification OTP'
        : 'ChatCat Pro — Password Reset OTP',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <div style="text-align:center;margin-bottom:20px">
            ${logoBase64 ? `<img src="${logoBase64}" style="width:90px;height:90px;object-fit:cover;border-radius:50%;display:block;margin:0 auto 10px" />` : ''}
            <h2 style="margin:4px 0 4px;color:#1e293b;font-size:20px">ChatCat Pro</h2>
          </div>
          <p style="color:#334155;font-size:15px;margin-bottom:20px">
            ${
              isSignup
                ? 'আপনার ChatCat Pro account <strong>verify</strong> করতে নিচের OTP কোডটি ব্যবহার করুন:'
                : 'আপনার ChatCat Pro account-এর <strong>password reset</strong> করতে নিচের OTP কোডটি ব্যবহার করুন:'
            }
          </p>
          <div style="background:#f0f0ff;border:2px solid #c7d2fe;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">
            <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#4f46e5;font-family:monospace">${code}</div>
          </div>
          <p style="color:#64748b;font-size:13px;text-align:center">
            এই OTP <strong>১০ মিনিটের</strong> জন্য valid।<br>
            কখনও এই কোড কাউকে শেয়ার করবেন না।
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
          <p style="color:#94a3b8;font-size:11px;text-align:center">ChatCat Pro Commerce Automation</p>
        </div>
      `,
    });

    this.logger.log(`[OTP] Sent ${purpose} OTP to ${email}`);
  }

  /** Verify the OTP code. Returns true and marks it used if valid. */
  async verifyOtp(
    email: string,
    code: string,
    purpose: 'signup' | 'reset',
  ): Promise<boolean> {
    const token = await this.prisma.otpToken.findFirst({
      where: {
        email,
        code,
        purpose,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });
    if (!token) return false;

    await this.prisma.otpToken.update({
      where: { id: token.id },
      data: { used: true },
    });
    return true;
  }
}
