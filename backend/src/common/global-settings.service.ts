import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

// 'all'           → Laptop ON: Ollama for bot + AI Generate
// 'generate_only' → Laptop OFF (Bot): bot uses OpenAI, AI Generate still tries Ollama
// 'none'          → Laptop OFF (Full): everything uses OpenAI directly
export type LocalAiMode = 'all' | 'generate_only' | 'none';

export interface GlobalSettings {
  localAiMode: LocalAiMode;
}

const DEFAULTS: GlobalSettings = { localAiMode: 'none' };
const FILE = join(process.cwd(), 'storage', 'settings', 'global.json');

@Injectable()
export class GlobalSettingsService {
  private cache: GlobalSettings = { ...DEFAULTS };
  private loaded = false;

  private async ensureDir() {
    await fs.mkdir(join(process.cwd(), 'storage', 'settings'), { recursive: true });
  }

  async get(): Promise<GlobalSettings> {
    if (this.loaded) return this.cache;
    try {
      const raw = await fs.readFile(FILE, 'utf8');
      const parsed = JSON.parse(raw);
      // Migrate old boolean field
      if (parsed.localAiMode === undefined) {
        parsed.localAiMode = parsed.localAiEnabled === true ? 'all' : 'none';
      }
      this.cache = { ...DEFAULTS, ...parsed };
    } catch {
      this.cache = { ...DEFAULTS };
    }
    this.loaded = true;
    return this.cache;
  }

  async set(patch: Partial<GlobalSettings>): Promise<GlobalSettings> {
    await this.ensureDir();
    this.cache = { ...(await this.get()), ...patch };
    await fs.writeFile(FILE, JSON.stringify(this.cache, null, 2), 'utf8');
    return this.cache;
  }
}
