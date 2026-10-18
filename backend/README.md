# ChatCat Pro — Backend API

Enterprise NestJS API engine powering multi-tenant conversational commerce, omnichannel integrations, OCR/AI vision pipelines, courier logistics, accounting, and reseller capabilities.

---

## 🏗 Architecture & Technologies

- **Framework**: [NestJS](https://nestjs.com/) (TypeScript)
- **Database & ORM**: PostgreSQL via [Prisma ORM](https://www.prisma.io/)
- **Process Manager**: PM2 (Cluster/Fork mode with memory monitoring)
- **AI & Vision**:
  - Google Gemini API (`@google/genai`)
  - OpenAI Vision & Fallbacks
  - Local Ollama vision/text integration
  - Tesseract.js OCR (Trained on English and Bengali alphanumeric invoice/code patterns)
- **Security & Integrity**:
  - AES-256-GCM token encryption (`EncryptionService`)
  - HMAC-SHA256 Meta webhook request verification
  - Role-based Access Control (Admin, Client, Reseller)
  - Throttler rate limiting (Global, Auth, and Chat tiers)

---

## 📦 Core Domain Modules

| Module Directory | Primary Responsibility |
|---|---|
| `src/auth/` | Authentication, sessions, OTP verification, Google OAuth, password management |
| `src/webhook/` | Meta Facebook Messenger webhook receiver & event dispatching |
| `src/whatsapp/` | WhatsApp Business Cloud API webhooks and interactive message delivery |
| `src/instagram/` | Instagram DM & comment-to-DM automated engagement |
| `src/bot/` & `src/smart-bot/` | AI-driven dialogue system, intent parser, and context awareness |
| `src/products/` & `src/catalog/` | Product catalog CRUD, image embeddings, categories, and public digital storefront |
| `src/orders/` | Order lifecycle (draft, confirm, status updates, invoice tokens, notifications) |
| `src/ocr/` & `src/vision-analysis/` | Screenshot receipt/product code extraction & multi-provider image recognition |
| `src/courier/` | Pathao, Steadfast, RedX, and Paperfly dispatch and parcel tracking integration |
| `src/accounting/` | Cashflow, revenue, expenses, returns, exchanges, and profit calculation |
| `src/wallet/` & `src/billing/` | Pay-as-you-go credit wallet, recharge requests, and SaaS plans |
| `src/reseller/` | White-label sub-tenancy, custom branding, wholesale balance & client management |
| `src/sms-gateway/` | Integration gateway receiving forwarded MFS SMS from PaySync Android app |
| `src/restaurant/` | Restaurant delivery slabs, geolocation map-pin checkout, and BOM inventory |
| `src/university/` | Notice web scrapers, crawler, FAQ responder, and automated post generation |

---

## 🛠 Local Setup & Development

### 1. Requirements
- Node.js 20+
- PostgreSQL 15+ (or Docker container)
- npm or pnpm

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Copy the sample environment file and configure database and secret keys:
```bash
cp .env.example .env
```

Ensure the following critical variables are populated:
```env
PORT=3000
DATABASE_URL="postgresql://user:password@localhost:5432/chatcatpro?schema=public"
FB_TOKEN_ENCRYPTION_KEY="<64-character-hex-key>"
FB_WEBHOOK_SECRET="<your-meta-app-secret>"
DEFAULT_VERIFY_TOKEN="<random-verify-token>"
AUTH_ADMIN_USERNAME="admin"
AUTH_ADMIN_PASSWORD="SecurePasswordHere"
```

### 4. Database Initialization
```bash
# Push Prisma schema to your PostgreSQL database
npx prisma db push

# Generate Prisma Client
npx prisma generate

# (Optional) Seed or open database browser
npx prisma studio
```

### 5. Running the Application
```bash
# Development mode with Hot Reload
npm run start:dev

# Production build and run
npm run build
npm run start:prod
```

---

## 🧪 Testing & Linting

```bash
# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e

# Run linter
npm run lint
```
