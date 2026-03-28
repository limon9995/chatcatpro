# Setup

1. Run `npm install`
2. Copy `.env.example` to `.env`
3. Add your secrets to `backend/.env`
4. To enable OpenAI features, set `OPENAI_API_KEY`, then switch `FALLBACK_AI_PROVIDER=openai` and/or `VISION_PROVIDER=openai`
5. Run `npx prisma generate`
6. Run `npx prisma migrate deploy`
7. Run `npm run build`
8. Run `npm run start:dev`

Notes:
- This project now includes `prisma/schema.prisma` and an initial migration.
- The zip should not be trusted as a complete dependency snapshot. Use a fresh `npm install` on your machine.
- Never put `OPENAI_API_KEY` in `landing/index.html` or any frontend file. Keep it server-side in `backend/.env` only.
