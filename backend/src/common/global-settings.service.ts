import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface GlobalSettings {
  localAiEnabled: boolean; // true = use Ollama laptop, false = use OpenAI directly
}

const DEFAULTS: GlobalSettings = { localAiEnabled: false };
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
      this.cache = { ...DEFAULTS, ...JSON.parse(raw) };
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
