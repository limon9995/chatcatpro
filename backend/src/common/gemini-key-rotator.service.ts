import { Injectable, Logger } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

export interface KeyState {
  key: string;
  status: 'active' | 'cooldown' | 'disabled';
  cooldownUntil: number; // epoch ms, 0 = active
  successCount: number;
  failureCount: number;
  healthScore: number; // calculated as successCount / (successCount + failureCount) * 100
  latencies: number[]; // array of last response times in ms
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
  errorMessage?: string;
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
      // Preserve state for keys that already exist
      const oldMap = new Map(this.states.map((s) => [s.key, s]));
      this.states = keyList.map((k) => {
        const old = oldMap.get(k);
        if (old) return old;
        return {
          key: k,
          status: 'active',
          cooldownUntil: 0,
          successCount: 0,
          failureCount: 0,
          healthScore: 100,
          latencies: [],
          lastLatencyMs: null,
          avgLatencyMs: null,
        };
      });
      this.lastLoadHash = hash;
      this.logger.log(`[GeminiRotator] Loaded ${keyList.length} key(s)`);
    }

    return this.states;
  }

  /** Returns the next available Gemini API key, or null if all exhausted */
  getKey(): string | null {
    const states = this.loadKeys();
    const now = Date.now();

    // Auto-reactivate any cooldowns that have expired
    for (const state of states) {
      if (state.status === 'cooldown' && state.cooldownUntil <= now) {
        state.status = 'active';
        state.cooldownUntil = 0;
        this.logger.log(`[GeminiRotator] Key ...${state.key.slice(-6)} cooldown expired — automatically reactivating.`);
      }
    }

    // Filter to find active/available keys (ignore permanently disabled and keys still in cooldown)
    const available = states.filter((s) => s.status === 'active');
    if (available.length === 0) {
      return null;
    }

    // Sort available keys by:
    // 1. Health score (higher is better). If health is same,
    // 2. Average latency (lower is better, keys with no recorded latency are treated as 0 ms to test them first)
    // 3. Fallback to insertion order (since it's a stable sort)
    available.sort((a, b) => {
      if (b.healthScore !== a.healthScore) {
        return b.healthScore - a.healthScore;
      }
      const avgA = a.avgLatencyMs ?? 0;
      const avgB = b.avgLatencyMs ?? 0;
      return avgA - avgB;
    });

    return available[0].key;
  }

  /** True if at least one key is available */
  isAvailable(): boolean {
    return this.getKey() !== null;
  }

  /** Legacy method to mark a key as quota-exhausted (mapped to 429 status code) */
  markExhausted(key: string): void {
    this.markError(key, 429, 'Quota exhausted (via legacy markExhausted)');
  }

  /** Record a successful API call and update response latency */
  markSuccess(key: string, latencyMs?: number): void {
    this.loadKeys();
    const state = this.states.find((s) => s.key === key);
    if (state) {
      state.status = 'active';
      state.cooldownUntil = 0;
      state.successCount++;
      state.errorMessage = undefined;

      if (latencyMs !== undefined && latencyMs !== null) {
        state.lastLatencyMs = latencyMs;
        state.latencies.push(latencyMs);
        if (state.latencies.length > 10) {
          state.latencies.shift(); // Keep last 10 latency measurements
        }
        const sum = state.latencies.reduce((sum, val) => sum + val, 0);
        state.avgLatencyMs = Math.round(sum / state.latencies.length);
      }

      // Re-calculate health score: successes / total
      const total = state.successCount + state.failureCount;
      state.healthScore = total > 0 ? Math.round((state.successCount / total) * 100) : 100;

      this.logger.log(
        `[GeminiRotator] Key ...${key.slice(-6)} request succeeded (latency: ${latencyMs}ms, health: ${state.healthScore}%)`,
      );
    }
  }

  /** Record a failed API call and assign cooldown/disable status based on code */
  markError(key: string, statusCode: number, errorMessage?: string): void {
    this.loadKeys();
    const state = this.states.find((s) => s.key === key);
    if (state) {
      state.failureCount++;
      state.errorMessage = errorMessage || `HTTP Error ${statusCode}`;

      // Calculate health score: successes / total
      const total = state.successCount + state.failureCount;
      state.healthScore = total > 0 ? Math.round((state.successCount / total) * 100) : 100;

      // Handle cooldown/disable logic based on status code
      if (statusCode === 429 || statusCode === 402) {
        // 429/402 (Quota Limit) -> 1 Hour Cooldown
        state.status = 'cooldown';
        state.cooldownUntil = Date.now() + 60 * 60 * 1000; // 1 hour
        this.logger.warn(
          `[GeminiRotator] Key ...${key.slice(-6)} hit quota limit (${statusCode}) — cooldown 1 hour. Available keys: ${
            this.states.filter((s) => s.status === 'active').length
          }/${this.states.length}`,
        );
      } else if (statusCode === 503 || statusCode === 504 || statusCode === 500) {
        // 503 (Server Busy) / 500 (Internal Error) -> 5 Minutes Cooldown
        state.status = 'cooldown';
        state.cooldownUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
        this.logger.warn(
          `[GeminiRotator] Key ...${key.slice(-6)} hit server error (${statusCode}) — cooldown 5 minutes. Available keys: ${
            this.states.filter((s) => s.status === 'active').length
          }/${this.states.length}`,
        );
      } else if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
        // Invalid API Key / Permission Denied -> Permanently Disable
        state.status = 'disabled';
        state.cooldownUntil = Infinity;
        this.logger.error(
          `[GeminiRotator] Key ...${key.slice(-6)} permanently disabled (status: ${statusCode}, msg: ${state.errorMessage}).`,
        );
      } else {
        // Other errors -> 5 mins cooldown
        state.status = 'cooldown';
        state.cooldownUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
        this.logger.warn(
          `[GeminiRotator] Key ...${key.slice(-6)} hit unexpected error (${statusCode}) — cooldown 5 minutes. Available keys: ${
            this.states.filter((s) => s.status === 'active').length
          }/${this.states.length}`,
        );
      }
    }
  }

  /** Returns status of all keys for admin display */
  getStatus() {
    const states = this.loadKeys();
    const now = Date.now();
    return {
      total: states.length,
      available: states.filter((s) => s.status === 'active' || (s.status === 'cooldown' && s.cooldownUntil <= now)).length,
      keys: states.map((s) => {
        const isCooldownExpired = s.status === 'cooldown' && s.cooldownUntil <= now;
        const currentStatus = isCooldownExpired ? 'active' : s.status;
        const currentCooldownUntil = isCooldownExpired ? 0 : s.cooldownUntil;

        return {
          masked: s.key.startsWith('AIza') ? `...${s.key.slice(-8)}` : `...${s.key.slice(-6)}`,
          available: currentStatus === 'active',
          status: currentStatus,
          exhaustedUntil: currentCooldownUntil > 0 && currentCooldownUntil !== Infinity ? currentCooldownUntil : null,
          successCount: s.successCount,
          failureCount: s.failureCount,
          healthScore: s.healthScore,
          lastLatencyMs: s.lastLatencyMs,
          avgLatencyMs: s.avgLatencyMs,
          errorMessage: s.errorMessage,
        };
      }),
    };
  }
}
