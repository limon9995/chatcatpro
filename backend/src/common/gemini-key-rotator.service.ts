import { Injectable, Logger } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

const QUOTA_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour per exhausted key

interface KeyState {
  key: string;
  exhaustedUntil: number; // epoch ms, 0 = available
}

@Injectable()
export class GeminiKeyRotatorService {
  private readonly logger = new Logger(GeminiKeyRotatorService.name);
  private states: KeyState[] = [];
  private lastLoadHash = '';

  constructor(private readonly apiKeysService: ApiKeysService) {}

  /** Returns all configured Gemini keys (loads fresh each call for hot-reload) */
  private loadKeys(): KeyState[] {
    const raw = this.apiKeysService.getSync('geminiApiKeys');
    const single = this.apiKeysService.getSync('geminiApiKey');

    // Build deduplicated key list: array field first, then legacy single key
    const keyList: string[] = [];
    if (raw) {
      try {
        const parsed: string[] = JSON.parse(raw);
        if (Array.isArray(parsed)) keyList.push(...parsed.filter(Boolean));
      } catch {}
    }
    if (single && !keyList.includes(single)) keyList.push(single);

    const hash = keyList.join('|');
    if (hash !== this.lastLoadHash) {
      // Preserve exhausted state for keys that already exist
      const oldMap = new Map(this.states.map((s) => [s.key, s]));
      this.states = keyList.map((k) => oldMap.get(k) ?? { key: k, exhaustedUntil: 0 });
      this.lastLoadHash = hash;
      this.logger.log(`[GeminiRotator] Loaded ${keyList.length} key(s)`);
    }

    return this.states;
  }

  /** Returns the next available Gemini API key, or null if all exhausted */
  getKey(): string | null {
    const states = this.loadKeys();
    const now = Date.now();
    const available = states.find((s) => s.exhaustedUntil <= now);
    return available?.key ?? null;
  }

  /** True if at least one key is available */
  isAvailable(): boolean {
    return this.getKey() !== null;
  }

  /** Mark a key as quota-exhausted — it won't be used for QUOTA_COOLDOWN_MS */
  markExhausted(key: string): void {
    this.loadKeys();
    const state = this.states.find((s) => s.key === key);
    if (state) {
      state.exhaustedUntil = Date.now() + QUOTA_COOLDOWN_MS;
      this.logger.warn(
        `[GeminiRotator] Key ...${key.slice(-6)} exhausted — cooldown 1h. Available keys: ${this.states.filter((s) => s.exhaustedUntil <= Date.now()).length}/${this.states.length}`,
      );
    }
  }

  /** Returns status of all keys for admin display */
  getStatus(): { total: number; available: number; keys: { masked: string; available: boolean; exhaustedUntil: number | null }[] } {
    const states = this.loadKeys();
    const now = Date.now();
    return {
      total: states.length,
      available: states.filter((s) => s.exhaustedUntil <= now).length,
      keys: states.map((s) => ({
        masked: `...${s.key.slice(-8)}`,
        available: s.exhaustedUntil <= now,
        exhaustedUntil: s.exhaustedUntil > now ? s.exhaustedUntil : null,
      })),
    };
  }
}
