import { Injectable, Logger } from '@nestjs/common';

/**
 * WhisperService — transcribes Facebook Messenger audio messages via OpenAI Whisper API.
 *
 * Flow:
 *  1. Download the audio buffer from the (pre-signed) Facebook CDN URL.
 *  2. POST to /v1/audio/transcriptions as multipart/form-data.
 *  3. Return the transcribed text, or null on any failure.
 *
 * Audio messages from Facebook Messenger are typically OGG/Opus files, 5-30 seconds long.
 * Whisper auto-detects the language, which handles Bangla, Banglish, and English correctly.
 */
@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private readonly apiKey: string;
  private readonly model = 'whisper-1';

  private failCount = 0;
  private readonly MAX_FAILS = 3;
  private cooldownUntil = 0;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    if (this.apiKey) {
      this.logger.log('[Whisper] Enabled — model=whisper-1');
    } else {
      this.logger.warn('[Whisper] OPENAI_API_KEY not set — voice transcription disabled');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && Date.now() > this.cooldownUntil;
  }

  /**
   * Downloads audio from FB CDN and transcribes it.
   * Returns the transcribed string, or null if transcription fails / is unavailable.
   */
  async transcribe(audioUrl: string): Promise<string | null> {
    if (!this.isAvailable()) return null;

    try {
      // 1. Download audio (FB pre-signed CDN URLs are publicly accessible)
      const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(15_000) });
      if (!audioRes.ok) {
        this.logger.warn(`[Whisper] Audio download failed status=${audioRes.status}`);
        this.recordFailure();
        return null;
      }

      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      if (audioBuffer.length < 100) {
        this.logger.warn('[Whisper] Audio buffer too small — likely empty');
        return null;
      }

      // 2. Determine file extension from Content-Type header
      const contentType = audioRes.headers.get('content-type') ?? 'audio/ogg';
      const ext = this.extFromContentType(contentType);

      // 3. Build multipart form — native FormData + File (Node 18+)
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: contentType });
      formData.append('file', blob, `audio${ext}`);
      formData.append('model', this.model);
      // Prompt helps Whisper stay in Bangla/Banglish context and not hallucinate English
      formData.append(
        'prompt',
        'এটি একটি Bangladeshi e-commerce shop-এর Facebook Messenger voice message। Customer Bangla বা Banglish-এ কথা বলছে।',
      );

      // 4. Call Whisper API
      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });

      if (whisperRes.status === 429 || whisperRes.status === 402) {
        this.logger.warn(`[Whisper] Quota/rate-limit hit (${whisperRes.status}) — cooldown`);
        this.enterCooldown();
        return null;
      }

      if (!whisperRes.ok) {
        const errText = await whisperRes.text().catch(() => '');
        this.logger.error(`[Whisper] API error ${whisperRes.status}: ${errText.slice(0, 120)}`);
        this.recordFailure();
        return null;
      }

      const data = (await whisperRes.json()) as { text?: string };
      const transcribed = (data?.text ?? '').trim();

      if (!transcribed) {
        this.logger.warn('[Whisper] Empty transcription returned');
        return null;
      }

      this.failCount = 0;
      this.logger.log(`[Whisper] Transcribed (${audioBuffer.length}B): "${transcribed.slice(0, 100)}"`);
      return transcribed;
    } catch (err: any) {
      this.logger.error(`[Whisper] Request failed: ${err?.message ?? err}`);
      this.recordFailure();
      return null;
    }
  }

  private extFromContentType(contentType: string): string {
    if (contentType.includes('ogg')) return '.ogg';
    if (contentType.includes('mpeg') || contentType.includes('mp3')) return '.mp3';
    if (contentType.includes('mp4') || contentType.includes('m4a')) return '.m4a';
    if (contentType.includes('wav')) return '.wav';
    if (contentType.includes('webm')) return '.webm';
    return '.ogg'; // FB Messenger default for voice
  }

  private recordFailure(): void {
    this.failCount++;
    if (this.failCount >= this.MAX_FAILS) {
      this.logger.warn(`[Whisper] ${this.MAX_FAILS} failures — cooldown 5min`);
      this.enterCooldown();
    }
  }

  private enterCooldown(): void {
    this.cooldownUntil = Date.now() + 5 * 60 * 1000;
    this.failCount = 0;
  }
}
