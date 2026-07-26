import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { ReviewsService } from './reviews.service';

@SkipThrottle({ global: true, auth: true, chat: true })
@Controller()
export class ReviewsController {
  constructor(
    private readonly svc: ReviewsService,
    private readonly auth: AuthService,
  ) {}

  // ── Public ──────────────────────────────────────────────────────────────────

  @Get('reviews/by-token')
  getByToken(@Query('token') token: string) {
    return this.svc.getByToken(token);
  }

  @Post('reviews')
  submit(@Body() body: any) {
    return this.svc.submit(body || {});
  }

  @Get('reviews/product/:pageId/:code')
  listForProduct(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Param('code') code: string,
  ) {
    return this.svc.listForProduct(pageId, code);
  }

  @Get('review')
  async reviewPage(@Query('token') token: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(this.buildReviewPageHtml(token || ''));
  }

  // ── Merchant (dashboard) ────────────────────────────────────────────────────

  private pid(req: any, pageId: string): number {
    const n = Number(pageId);
    this.auth.ensurePageAccess(req.user || req.authUser, n);
    return n;
  }

  @UseGuards(AuthGuard)
  @Get('client-dashboard/:pageId/reviews')
  listMerchant(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.listForMerchant(this.pid(r, p));
  }

  @UseGuards(AuthGuard)
  @Delete('client-dashboard/:pageId/reviews/:id')
  deleteReview(
    @Param('pageId') p: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() r: any,
  ) {
    return this.svc.deleteReview(this.pid(r, p), id);
  }

  // ── HTML ────────────────────────────────────────────────────────────────────

  private buildReviewPageHtml(token: string): string {
    return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Review দিন</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#f8f9fb;color:#0f172a;margin:0;padding:20px;}
  .wrap{max-width:480px;margin:0 auto;}
  h1{font-size:18px;margin:0 0 16px;}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;}
  .name{font-weight:700;font-size:14px;margin-bottom:8px;}
  .stars{font-size:26px;letter-spacing:4px;cursor:pointer;user-select:none;}
  .stars span{color:#d1d5db;}
  .stars span.on{color:#f59e0b;}
  textarea{width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:8px;padding:8px;font:inherit;margin-top:8px;min-height:60px;}
  button{background:#5b63f5;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:13px;margin-top:8px;}
  button:disabled{opacity:.5;cursor:default;}
  .done{color:#16a34a;font-size:13px;font-weight:700;}
  .err{color:#dc2626;font-size:12px;margin-top:16px;}
</style>
</head>
<body>
<div class="wrap">
  <h1>⭐ আপনার অর্ডারের item গুলো কেমন লেগেছে?</h1>
  <div id="list">লোড হচ্ছে...</div>
</div>
<script>
const TOKEN = ${JSON.stringify(token)};
async function load() {
  const list = document.getElementById('list');
  try {
    const r = await fetch('/reviews/by-token?token=' + encodeURIComponent(TOKEN));
    if (!r.ok) throw new Error('link');
    const data = await r.json();
    if (!data.products || !data.products.length) {
      list.innerHTML = '<div class="card">কোনো item পাওয়া যায়নি।</div>';
      return;
    }
    list.innerHTML = data.products.map(p => cardHtml(p)).join('');
  } catch (e) {
    list.innerHTML = '<div class="err">লিংকটি সঠিক নয় বা মেয়াদ শেষ হয়ে গেছে।</div>';
  }
}
function cardHtml(p) {
  if (p.alreadyReviewed) {
    return '<div class="card"><div class="name">' + escapeHtml(p.name) + '</div><div class="done">✅ Review দেওয়া হয়েছে, ধন্যবাদ!</div></div>';
  }
  const id = 'p' + p.productId;
  return '<div class="card" id="' + id + '">' +
    '<div class="name">' + escapeHtml(p.name) + '</div>' +
    '<div class="stars" data-rating="0">' + [1,2,3,4,5].map(n => '<span data-n="' + n + '">★</span>').join('') + '</div>' +
    '<textarea placeholder="মতামত লিখুন (optional)"></textarea>' +
    '<div><button onclick="submitReview(' + p.productId + ')">Submit</button></div>' +
    '</div>';
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
document.addEventListener('click', (e) => {
  const star = e.target.closest('.stars span');
  if (!star) return;
  const box = star.closest('.stars');
  const n = Number(star.dataset.n);
  box.dataset.rating = n;
  [...box.children].forEach((s, i) => s.classList.toggle('on', i < n));
});
async function submitReview(productId) {
  const card = document.getElementById('p' + productId);
  const rating = Number(card.querySelector('.stars').dataset.rating || 0);
  if (!rating) { alert('কমপক্ষে ১টা star দিন'); return; }
  const comment = card.querySelector('textarea').value;
  const btn = card.querySelector('button');
  btn.disabled = true;
  try {
    const r = await fetch('/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, productId, rating, comment }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || 'error'); }
    card.innerHTML = '<div class="name">✅ ধন্যবাদ!</div>';
  } catch (e) {
    btn.disabled = false;
    alert(e.message || 'কিছু ভুল হয়েছে');
  }
}
load();
</script>
</body>
</html>`;
  }
}
