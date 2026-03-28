import { Logger } from '@nestjs/common';

const logger = new Logger('EnvValidator');

interface EnvRule {
  key: string;
  required: boolean;
  hint: string;
  validate?: (val: string) => string | null; // return error message or null
}

const RULES: EnvRule[] = [
  {
    key: 'DATABASE_URL',
    required: true,
    hint: 'PostgreSQL: "postgresql://user:pass@host:5432/dbname"',
  },
  {
    key: 'FB_TOKEN_ENCRYPTION_KEY',
    required: true,
    hint: "Random 32+ char string. Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    validate: (v) =>
      v.length < 16 ? 'Too short — use at least 16 characters' : null,
  },
  {
    key: 'AUTH_ADMIN_USERNAME',
    required: true,
    hint: 'Admin login username (e.g. "admin")',
  },
  {
    key: 'AUTH_ADMIN_PASSWORD',
    required: true,
    hint: 'Admin login password — minimum 8 characters',
    validate: (v) =>
      v.length < 8 ? 'Password too short — minimum 8 characters' : null,
  },
  {
    key: 'FB_WEBHOOK_SECRET',
    required: false,
    hint: 'Facebook App Secret — required for webhook signature verification. Get from Meta Developer Console.',
    validate: (v) =>
      v && v.length < 10
        ? 'Looks too short — double check your App Secret'
        : null,
  },
  {
    key: 'DEFAULT_VERIFY_TOKEN',
    required: false,
    hint: 'Fallback webhook verify token (optional if all pages have per-page verifyToken)',
  },
];

export function validateEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeEnv = String(process.env.NODE_ENV || 'development').trim();
  const isProduction = nodeEnv === 'production';

  for (const rule of RULES) {
    const val = process.env[rule.key]?.trim() ?? '';

    if (!val) {
      if (rule.required) {
        errors.push(`  ❌ ${rule.key} is required\n     → ${rule.hint}`);
      } else {
        warnings.push(`  ⚠️  ${rule.key} not set\n     → ${rule.hint}`);
      }
      continue;
    }

    if (rule.validate) {
      const err = rule.validate(val);
      if (err) {
        if (rule.required) {
          errors.push(`  ❌ ${rule.key}: ${err}`);
        } else {
          warnings.push(`  ⚠️  ${rule.key}: ${err}`);
        }
      }
    }
  }

  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  const webhookSecret = String(process.env.FB_WEBHOOK_SECRET || '').trim();
  const defaultVerifyToken = String(process.env.DEFAULT_VERIFY_TOKEN || '').trim();
  const landingUrl = String(process.env.LANDING_PAGE_URL || '').trim();
  const redirectUri = String(process.env.FB_REDIRECT_URI || '').trim();
  const storagePublicUrl = String(process.env.STORAGE_PUBLIC_URL || '').trim();
  const oauthStateSecret = String(process.env.FB_OAUTH_STATE_SECRET || '').trim();
  const openAiApiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const fallbackProvider = String(process.env.FALLBACK_AI_PROVIDER || '').trim().toLowerCase();
  const visionProvider = String(process.env.VISION_PROVIDER || '').trim().toLowerCase();
  const fallbackModel = String(process.env.FALLBACK_AI_MODEL || '').trim();
  const visionModel = String(process.env.VISION_MODEL || '').trim();

  if (databaseUrl.startsWith('file:')) {
    warnings.push(
      '  ⚠️  DATABASE_URL points to a local file (SQLite)\n     → This is fine for local development only. Set a PostgreSQL connection string for production.',
    );
  }

  if (isProduction && databaseUrl.startsWith('file:')) {
    errors.push(
      '  ❌ DATABASE_URL is a local SQLite file in production mode\n     → Set a PostgreSQL connection string: postgresql://user:pass@host:5432/dbname',
    );
  }

  if (isProduction && !webhookSecret) {
    errors.push(
      '  ❌ FB_WEBHOOK_SECRET is required in production\n     → Webhook signature verification must not be skipped on a live server.',
    );
  }

  if (isProduction && defaultVerifyToken) {
    errors.push(
      '  ❌ DEFAULT_VERIFY_TOKEN must be unset in production\n     → Use per-page verify tokens only.',
    );
  }

  if (isProduction && !oauthStateSecret) {
    errors.push(
      '  ❌ FB_OAUTH_STATE_SECRET is required in production\n     → Set a dedicated secret for signed OAuth state validation.',
    );
  }

  if ((fallbackProvider === 'openai' || visionProvider === 'openai') && !openAiApiKey) {
    warnings.push(
      '  ⚠️  OPENAI_API_KEY not set\n     → Required when FALLBACK_AI_PROVIDER=openai or VISION_PROVIDER=openai.',
    );
  }

  if (fallbackProvider === 'openai' && !fallbackModel) {
    warnings.push(
      '  ⚠️  FALLBACK_AI_MODEL not set\n     → Defaulting to gpt-4o for AI fallback replies.',
    );
  }

  if (visionProvider === 'openai' && !visionModel) {
    warnings.push(
      '  ⚠️  VISION_MODEL not set\n     → Defaulting to gpt-4o for product image analysis.',
    );
  }

  for (const [key, value] of [
    ['LANDING_PAGE_URL', landingUrl],
    ['FB_REDIRECT_URI', redirectUri],
    ['STORAGE_PUBLIC_URL', storagePublicUrl],
  ] as const) {
    if (!value) continue;
    if (/localhost|127\.0\.0\.1/i.test(value)) {
      warnings.push(
        `  ⚠️  ${key} points to localhost\n     → Replace it with your real production domain before launch.`,
      );
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    logger.warn(
      '\n┌─ ENV WARNINGS ──────────────────────────────────\n' +
        warnings.join('\n') +
        '\n└─────────────────────────────────────────────────',
    );
  }

  // Fatal errors — crash on startup
  if (errors.length > 0) {
    const msg =
      '\n┌─ ENV VALIDATION FAILED — cannot start ──────────\n' +
      errors.join('\n') +
      '\n└─────────────────────────────────────────────────\n' +
      '  Create a .env file with the missing variables.\n' +
      '  See .env.example for reference.\n';
    logger.error(msg);
    process.exit(1);
  }

  logger.log('✅ ENV validation passed');
}
