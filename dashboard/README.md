# ChatCat Pro — Web Dashboard

The merchant and administrator control center for ChatCat Pro, built with **React 19**, **TypeScript**, and **Vite**.

---

## 🚀 Features

- **Storefront & Catalog Management**: Real-time product inventory, variant options, pricing policies, and combos.
- **Order Processing Pipeline**: Track customer orders from Facebook, WhatsApp, Instagram, or Web Storefront. One-click dispatch with Steadfast, Pathao, RedX, and Paperfly.
- **Multi-Tenant White-Labeling**: Custom logo, brand colors, domains, and agency management via Reseller portals.
- **Visual Analytics & Accounting**: Profit calculations, expenses breakdown, delivery return rates, and financial ledger.
- **Live Communication**: Customer relationship management (CRM), broadcast campaigns, and automated follow-ups.
- **Omnichannel Configurator**: Quick connection for Meta Facebook Pages, WhatsApp Cloud API, and Instagram Business accounts.
- **Bilingual Interface**: Full Bengali (`বাংলা`) and English localization with instant switching.
- **Theme**: High-contrast Dark and Light modes persisted across sessions.

---

## 🛠 Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: TypeScript
- **Styling**: Modern CSS variables with responsive layouts and smooth micro-interactions
- **Routing**: Optimized state & URL-parameter based screen controller (`App.tsx`)
- **Map & Geolocation**: Leaflet for restaurant order geolocation and pin drop checkout

---

## 💻 Getting Started

### 1. Prerequisites
- Node.js 20+
- npm or pnpm
- Backend API running locally (defaults to `http://localhost:3000`)

### 2. Installation
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the `dashboard` directory:
```env
VITE_API_BASE=http://localhost:3000
```

### 4. Running the Dashboard
```bash
# Start Vite development server (http://localhost:5173)
npm run dev

# Type check and build for production (dist/)
npm run build

# Preview production build locally
npm run preview

# Lint check
npm run lint
```
