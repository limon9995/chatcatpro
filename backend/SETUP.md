# Setup

1. Run `npm install`
2. Copy `.env.example` to `.env`
3. Run `npx prisma generate`
4. Run `npx prisma migrate deploy`
5. Run `npm run build`
6. Run `npm run start:dev`

Notes:
- This project now includes `prisma/schema.prisma` and an initial migration.
- The zip should not be trusted as a complete dependency snapshot. Use a fresh `npm install` on your machine.
