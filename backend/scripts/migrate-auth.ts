/**
 * V12 Migration Script: users.json → Prisma DB
 * Run once after deploying V12:
 *   npx ts-node scripts/migrate-auth.ts
 */
import * as path from 'path';
import * as fs   from 'fs';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const usersFile = path.join(process.cwd(), 'storage', 'auth', 'users.json');
  if (!fs.existsSync(usersFile)) {
    console.log('✅ No users.json found — nothing to migrate'); return;
  }
  const raw: any[] = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  console.log(`Found ${raw.length} users in JSON file`);
  let imported = 0, skipped = 0;
  for (const u of raw) {
    const username = String(u.username || u.email || `user_${u.id || Date.now()}`).trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, ...(u.email ? [{ email: u.email }] : [])] },
    });
    if (existing) { console.log(`  SKIP ${username} — already in DB`); skipped++; continue; }
    await prisma.user.create({
      data: {
        id: u.id || crypto.randomUUID(), username,
        email: u.email ?? null, name: u.name || username,
        role: u.role || 'client', isActive: u.isActive !== false,
        passwordHash: u.passwordHash || '', salt: u.salt || '',
        forcePasswordChange: u.forcePasswordChange ?? false,
        pageIds: JSON.stringify(Array.isArray(u.pageIds) ? u.pageIds : []),
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
      },
    });
    console.log(`  ✅ Imported: ${username} (${u.role || 'client'})`);
    imported++;
  }
  fs.renameSync(usersFile, usersFile + '.migrated');
  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}`);
  console.log('⚠️  Users will need to log in again (sessions not migrated)');
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
