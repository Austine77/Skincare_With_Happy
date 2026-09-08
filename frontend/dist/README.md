# Skincare With Happy

A long-term skincare e-commerce platform with a separate static frontend and Node.js/Express backend, designed for Vercel deployment and PostgreSQL + Paystack.

## Project structure

- `frontend/` — customer-facing storefront, cart and checkout UI.
- `backend/` — REST API, PostgreSQL integration and Paystack payment verification/webhook.
- `frontend/.env` / `.env.sample` — frontend API configuration.
- `backend/.env` / `.env.sample` — backend/database/payment configuration.

## Local development

### Backend

```bash
cd backend
npm install
npm run db:init
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run build
npx serve dist -l 3000
```

Set `VITE_API_BASE_URL` in `frontend/.env` to the backend URL.

## Vercel deployment

Create **two Vercel projects** from the same GitHub repository:

### 1. Backend project

- Root Directory: `backend`
- Framework Preset: Other
- Build/Output: use the included `vercel.json`
- Environment variables:
  - `NODE_ENV=production`
  - `DATABASE_URL=...`
  - `PAYSTACK_SECRET_KEY=...`
  - `FRONTEND_URL=https://YOUR-FRONTEND.vercel.app`
  - `CORS_ORIGIN=https://YOUR-FRONTEND.vercel.app`

The API is available under `/api/*`.

### 2. Frontend project

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable:
  - `VITE_API_BASE_URL=https://YOUR-BACKEND.vercel.app/api`

## Paystack

Use the secret key only in the backend environment. The frontend must never receive `PAYSTACK_SECRET_KEY`.

The backend verifies successful transactions and also exposes `/api/paystack/webhook` for Paystack event delivery. Stock is reduced only after a payment is verified successfully.

## Database

Run `backend/db/seed.js` once against your production PostgreSQL database to create the tables and seed starter skincare products.
