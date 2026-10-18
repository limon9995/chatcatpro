<p align="center">
  <img src="landing/logo.png" alt="Chatcat Pro Logo" width="120" height="120" style="border-radius: 20px;">
</p>

<h1 align="center">Chatcat Pro</h1>

<p align="center">
  <strong>Multi-tenant SaaS Platform for Facebook, WhatsApp & Instagram Commerce Automation</strong>
</p>

<p align="center">
  <a href="https://chatcat.pro"><img src="https://img.shields.io/badge/Website-chatcat.pro-4F6EF7?style=flat-square" alt="Website"></a>
  <a href="https://app.chatcat.pro"><img src="https://img.shields.io/badge/Dashboard-app.chatcat.pro-7C9DFF?style=flat-square" alt="Dashboard"></a>
  <a href="https://api.chatcat.pro"><img src="https://img.shields.io/badge/API-api.chatcat.pro-00D4A0?style=flat-square" alt="API"></a>
  <br>
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/NestJS-10+-E0234E?style=flat-square&logo=nestjs" alt="NestJS">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Prisma-5.9-2D3748?style=flat-square&logo=prisma" alt="Prisma">
  <br>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square" alt="PRs Welcome">
</p>

---

## 🚀 Overview

**Chatcat Pro** is a comprehensive commerce automation platform designed for **Bengali-speaking e-commerce entrepreneurs** in Bangladesh. It enables Facebook Page, WhatsApp Business, and Instagram Business account owners to automate their entire sales workflow—from customer inquiry to order fulfillment and accounting.

### 🎯 Core Value Proposition

| Problem | Chatcat Pro Solution |
|---------|---------------------|
| Manual order taking via Messenger/WhatsApp | **AI-powered bot** handles conversations 24/7 in Bangla/Banglish/English |
| Product identification from screenshots | **OCR + AI Vision** detects products from images automatically |
| Courier booking across multiple providers | **One-click booking** for Pathao, Steadfast, RedX, Paperfly |
| Tracking revenue, expenses, profit | **Built-in accounting** with collections, returns, exchanges |
| Customer management | **CRM** with order history, tags, follow-ups, broadcasts |
| Multi-channel selling | **Unified dashboard** for Facebook, WhatsApp, Instagram |

---

## ✨ Key Features

### 🤖 Intelligent Automation
- **SmartBot** — Single AI call handles entire conversation flow (intent detection, product matching, order creation)
- **Multi-language** — Bangla, Banglish (Latin script), English
- **Image Recognition** — OCR (Tesseract) + AI Vision (Gemini/OpenAI) for product code detection
- **Voice Messages** — Speech-to-text via Whisper for voice note processing
- **Fallback AI** — Graceful degradation when primary AI fails

### 📦 Order Management
- **End-to-end flow**: Inquiry → Product detection → Draft → Confirmation → Courier booking → Delivery
- **Payment Modes**: COD, Advance (outside Dhaka), Full Advance, Web Checkout
- **Negotiation Handling** — Bot manages price negotiation conversations
- **Spam/Fraud Detection** — Phone-based risk scoring before order confirmation

### 🚚 Courier Integration
| Courier | Features |
|---------|----------|
| Pathao | COD booking, tracking, webhook updates |
| Steadfast | COD booking, tracking, return handling |
| RedX | COD booking, tracking |
| Paperfly | COD booking, tracking |

### 💰 Accounting & Wallet
- **Double-entry style** accounting: Collections, Expenses, Returns, Exchanges
- **Credit-based wallet** — Pay-as-you-go for AI usage (vision, OCR, text generation)
- **Profit Engine** — Real-time revenue, cost, profit per order/page
- **Reseller Ledger** — Wholesale cost tracking for white-label partners

### 🏪 Multi-Tenant Architecture
- **Pages** — Each Facebook/Insta/WhatsApp business = one Page record
- **Linked Pages** — Master page shares products/bot-knowledge with linked pages
- **Custom Domains** — `shop.merchant.com` with auto-SSL via Nginx
- **Reseller White-label** — Agencies run branded instances on same backend

### 🛍️ Specialized Modes
- **Restaurant Mode** — Map-pin delivery, distance-slab fees, BOM inventory, recipe costing
- **University Mode** — Notice scraping, group links, FAQ bot for educational institutions
- **Catalog Website** — Public product catalog with category tabs, SEO-friendly

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VPS (Ubuntu 22.04)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Nginx      │  │   Nginx      │  │      Nginx           │  │
│  │  (Port 80)   │  │  (Port 80)   │  │    (Port 80/443)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         ▼                 ▼                      ▼              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Landing    │  │  Dashboard   │  │     Backend API      │  │
│  │  (Static)    │  │  (React 19)  │  │    (NestJS + PM2)    │  │
│  │ chatcat.pro  │  │ app.chatcat. │  │    api.chatcat.pro   │  │
│  └──────────────┘  └──────────────┘  └──────────┬───────────┘  │
│                                                 │              │
│                                          ┌──────┴──────┐       │
│                                          │  PostgreSQL  │       │
│                                          │   (Local)    │       │
│                                          └──────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend API** | NestJS 10, TypeScript, Prisma ORM |
| **Database** | PostgreSQL 16 (production), SQLite (dev) |
| **Frontend** | React 19, TypeScript, Vite, CSS Modules |
| **Mobile** | Android (Kotlin) — SMS forwarder for payment verification |
| **AI/ML** | Gemini Vision, OpenAI Vision, Tesseract OCR, Whisper STT |
| **Queue/Jobs** | In-memory queue with cron scheduler |
| **Auth** | Token-based sessions, Google OAuth, AES-256 token encryption |
| **Deployment** | PM2, Nginx reverse proxy, Certbot SSL |

---

## 📁 Repository Structure

```
chatcatpro/
├── backend/                 # NestJS API Server (Port 3000)
│   ├── src/
│   │   ├── auth/            # Authentication, sessions, Google OAuth
│   │   ├── webhook/         # Facebook Messenger webhook entry
│   │   ├── bot/             # Intent detection, reply templates, SmartBot
│   │   ├── bot-knowledge/   # Training data / knowledge base
│   │   ├── conversation-context/  # Per-conversation state
│   │   ├── messenger/       # Facebook Send API wrapper
│   │   ├── orders/          # Order lifecycle management
│   │   ├── products/        # Product catalog CRUD
│   │   ├── ocr/             # Image-to-text product detection
│   │   ├── ocr-queue/       # Background OCR job queue
│   │   ├── courier/         # Pathao, Steadfast, RedX, Paperfly
│   │   ├── accounting/      # Revenue, expenses, profit, returns
│   │   ├── crm/             # Customer records & history
│   │   ├── broadcast/       # Bulk Messenger campaigns
│   │   ├── followup/        # Automated follow-up sequences
│   │   ├── catalog/         # Public product catalog API
│   │   ├── billing/         # Subscriptions, payments, plans
│   │   ├── page/            # Per-page config & settings
│   │   ├── facebook/        # OAuth flow for FB page connection
│   │   ├── print/           # Invoice/memo generation
│   │   ├── memo/            # Memo templates & assets
│   │   ├── scheduler/       # Cron-style automated tasks
│   │   ├── admin/           # Admin panel backend
│   │   ├── whatsapp/        # WhatsApp Business API
│   │   ├── instagram/       # Instagram Business API
│   │   ├── wallet/          # Credit wallet & pricing
│   │   ├── sms-gateway/     # Android SMS forwarder webhook
│   │   ├── payment-verify/  # bKash/Nagad payment verification
│   │   ├── university/      # University automation module
│   │   ├── reseller/        # White-label reseller system
│   │   ├── ai-generate/     # AI text generation (descriptions, broadcasts)
│   │   ├── embedding/       # CLIP visual embeddings
│   │   ├── vision-analysis/ # Multi-provider vision analysis
│   │   └── common/          # Encryption, pricing, env validation
│   ├── prisma/
│   │   └── schema.prisma    # Complete database schema
│   ├── test/                # Jest unit & e2e tests
│   ├── scripts/             # deploy.sh, db-init.sh
│   └── ecosystem.config.js  # PM2 process config
│
├── dashboard/               # React 19 Admin Dashboard (Port 5173)
│   ├── src/
│   │   ├── pages/           # 30+ page components
│   │   ├── components/      # UI primitives (ui.tsx)
│   │   ├── hooks/           # useAuth, useApi, useToast, useBranding
│   │   ├── i18n/            # Bangla/English translations
│   │   └── utils/           # Helpers (geo.ts for Dhaka areas)
│   ├── public/              # Static assets
│   └── package.json
│
├── landing/                 # Static Marketing Site (No build)
│   ├── index.html           # Main landing page
│   ├── order.html           # Order page
│   ├── privacy.html         # Privacy policy
│   └── robots.txt / sitemap.xml
│
├── paysync-android/         # Android SMS Forwarder App
│   └── app/src/main/java/pro/chatcat/paysync/
│       ├── PaySyncService.kt   # Foreground service, SMS polling
│       ├── SmsReceiver.kt      # SMS broadcast receiver
│       └── SetupActivity.kt    # Token configuration UI
│
├── storage/                 # Runtime storage (gitignored in prod)
│   └── bot-knowledge/       # Learning logs, global knowledge
│
├── branding/                # Logo, icons, design assets
├── .agents/skills/          # AI agent skill definitions
├── CLAUDE.md                # AI assistant guidance
├── AGENTS.md                # Code review graph tools
├── DEPLOYMENT.md            # Production deployment guide
├── WHATSAPP_AUTOMATION_GUIDE.md  # WhatsApp setup guide
└── GEMINI.md                # Gemini AI configuration
```

---

## 🛠️ Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or Docker)
- npm/yarn/pnpm

### 1. Clone & Install

```bash
git clone https://github.com/limon9995/chatcatpro.git
cd chatcatpro
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values (see Required Environment Variables below)

# Database setup (first time)
bash scripts/db-init.sh    # Creates schema in PostgreSQL

# Start development server
npm run start:dev          # http://localhost:3000
```

### 3. Dashboard Setup

```bash
cd ../dashboard

# Install dependencies
npm install

# Configure environment
cp .env.example .env       # Set VITE_API_BASE=http://localhost:3000

# Start dev server
npm run dev                # http://localhost:5173
```

### 4. Landing Page

```bash
cd ../landing
# No build step — serve static files directly
# In production: Nginx serves this folder
```

---

## ⚙️ Required Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/chatcatpro` |
| `FB_TOKEN_ENCRYPTION_KEY` | 64-char hex for AES-256 | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `FB_WEBHOOK_SECRET` | Meta App Secret for HMAC | From Facebook Developer Console |
| `DEFAULT_VERIFY_TOKEN` | Webhook verification token | Any random string |
| `AUTH_ADMIN_USERNAME` / `AUTH_ADMIN_PASSWORD` | Bootstraps admin account | `admin` / `SecurePass123!` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `https://chatcat.pro,https://app.chatcat.pro` |
| `PORT` | Server port (default 3000) | `3000` |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | For OTP emails | `otp@chatcat.pro` / `app-password` |

### Dashboard (`dashboard/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE` | Backend API URL | `http://localhost:3000` |

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Complete VPS deployment guide (Nginx, PM2, SSL, PostgreSQL) |
| [WHATSAPP_AUTOMATION_GUIDE.md](WHATSAPP_AUTOMATION_GUIDE.md) | WhatsApp Business API setup (zero-touch client onboarding) |
| [CLAUDE.md](CLAUDE.md) | AI assistant guidance for codebase navigation |
| [backend/README.md](backend/README.md) | Backend-specific commands & setup |
| [dashboard/README.md](dashboard/README.md) | Dashboard-specific commands |

---

## 🔧 Development Commands

### Backend
```bash
cd backend

npm run start:dev      # Development with watch mode
npm run start:prod     # Production (requires build)
npm run build          # Prisma generate + TypeScript compile → dist/
npm run lint           # ESLint with auto-fix
npm run test           # Jest unit tests
npm run test:watch     # Watch mode
npm run test:cov       # Coverage report
npm run test:e2e       # End-to-end tests
npx prisma generate    # Regenerate Prisma client
npx prisma migrate dev # Create & apply migration
npx prisma studio      # Visual DB browser
```

### Dashboard
```bash
cd dashboard

npm run dev            # Vite dev server (port 5173)
npm run build          # TypeScript + Vite production build
npm run lint           # ESLint check
npm run preview        # Preview production build
```

---

## 🚀 Production Deployment

**All services run on a single VPS** (Ubuntu 22.04) with Nginx + PM2:

| Domain | Service | Path |
|--------|---------|------|
| `chatcat.pro` | Landing (static) | `/var/www/chatcatpro/landing/` |
| `app.chatcat.pro` | Dashboard (React) | `/var/www/chatcatpro/dashboard/dist/` |
| `api.chatcat.pro` | Backend (NestJS) | PM2 → `http://127.0.0.1:3000` |

**Deploy Backend:**
```bash
ssh root@your-vps-ip
cd /var/www/chatcatpro/backend
git pull origin main
bash scripts/deploy.sh   # npm ci → prisma generate → build → pm2 reload
```

**Deploy Dashboard:**
```bash
cd /var/www/chatcatpro/dashboard
git pull origin main
npm install && npm run build
```

**Deploy Landing:**
```bash
cd /var/www/chatcatpro/landing
git pull origin main
# No build — static HTML served by Nginx
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete instructions including Nginx config, SSL, PostgreSQL setup, and schema migrations.

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Code Style
- **Backend**: ESLint + Prettier (run `npm run lint` in `backend/`)
- **Dashboard**: ESLint + TypeScript strict mode (run `npm run lint` in `dashboard/`)
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 📞 Support & Community

- **Website**: [chatcat.pro](https://chatcat.pro)
- **Dashboard**: [app.chatcat.pro](https://app.chatcat.pro)
- **WhatsApp Support**: [+8801720450797](https://wa.me/8801720450797)
- **Facebook**: [Chatcat Pro](https://m.me/Chatcatpro)

---

## 🙏 Acknowledgments

- **NestJS** — Progressive Node.js framework
- **React** — UI library
- **Prisma** — Next-generation ORM
- **Meta** — Facebook/WhatsApp/Instagram APIs
- **Pathao, Steadfast, RedX, Paperfly** — Courier partners
- **Google Gemini / OpenAI** — AI vision & text generation
- **Bangladeshi seller community** — For feedback & feature requests

---

<p align="center">
  Made with ❤️ for Bangladesh's digital entrepreneurs
</p>