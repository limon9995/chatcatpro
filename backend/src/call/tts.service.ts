import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface TtsSettings {
  ttsProvider: string; // GOOGLE | ELEVENLABS | AWS_POLLY
  voiceType: string; // MALE | FEMALE
  voiceStyle: string; // NATURAL | FORMAL | CHEERFUL
  voiceId: string; // provider-specific voice ID
}

export interface TtsResult {
  success: boolean;
  url?: string;
  message: string;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly storageRoot = path.join(
    process.cwd(),
    'storage',
    'call-voices',
  );

  constructor() {
    fs.mkdirSync(this.storageRoot, { recursive: true });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Return URL if a pre-generated audio file exists for this page+language */
  async getCallAudioUrl(
    pageId: number,
    language: string,
  ): Promise<string | null> {
    const fname = this.filename(language);
    const fpath = path.join(this.storageRoot, `page-${pageId}`, fname);
    return fs.existsSync(fpath) ? this.toPublicUrl(pageId, fname) : null;
  }

  /** Generate audio from script and persist to disk */
  async generateVoice(
    pageId: number,
    language: 'BN' | 'EN',
    script: string,
    settings: TtsSettings,
  ): Promise<TtsResult> {
    if (!script?.trim()) return { success: false, message: 'Script is empty' };

    const provider = (settings.ttsProvider || '').toUpperCase();
    if (!provider) {
      return {
        success: false,
        message:
          'TTS provider configure হয়নি। Dashboard → Voice Settings → TTS Provider select করুন।',
      };
    }

    const pageDir = path.join(this.storageRoot, `page-${pageId}`);
    fs.mkdirSync(pageDir, { recursive: true });
    const fname = this.filename(language);

    try {
      this.logger.log(
        `[TTS] Generating ${language} via ${provider} for page #${pageId}`,
      );
      const audio = await this.dispatchTts(
        provider,
        script,
        language,
        settings,
      );
      fs.writeFileSync(path.join(pageDir, fname), audio);
      const url = this.toPublicUrl(pageId, fname);
      this.logger.log(`[TTS] Saved → ${url}`);
      return { success: true, url, message: 'Voice generated!' };
    } catch (err) {
      const msg = `TTS error (${provider}): ${String(err)}`;
      this.logger.error(msg);
      return { success: false, message: msg };
    }
  }

  /** Check whether pre-generated audio exists */
  async previewVoice(
    pageId: number,
    language: 'BN' | 'EN',
  ): Promise<{ exists: boolean; url?: string }> {
    const fname = this.filename(language);
    const fpath = path.join(this.storageRoot, `page-${pageId}`, fname);
    return fs.existsSync(fpath)
      ? { exists: true, url: this.toPublicUrl(pageId, fname) }
      : { exists: false };
  }

  /** Save a manually uploaded audio file for use in confirmation calls */
  async uploadVoice(
    pageId: number,
    language: 'BN' | 'EN',
    file: { buffer: Buffer; originalname?: string },
  ): Promise<TtsResult> {
    if (!file?.buffer?.length) {
      return { success: false, message: 'Audio file is empty' };
    }

    const pageDir = path.join(this.storageRoot, `page-${pageId}`);
    fs.mkdirSync(pageDir, { recursive: true });
    const fname = this.filename(language);
    fs.writeFileSync(path.join(pageDir, fname), file.buffer);
    const url = this.toPublicUrl(pageId, fname);
    this.logger.log(`[TTS] Uploaded manual ${language} voice for page #${pageId} -> ${url}`);
    return { success: true, url, message: 'Voice uploaded!' };
  }

  /** Delete cached audio (called when script changes) */
  async deleteVoice(pageId: number, language: 'BN' | 'EN'): Promise<void> {
    const fpath = path.join(
      this.storageRoot,
      `page-${pageId}`,
      this.filename(language),
    );
    if (fs.existsSync(fpath)) {
      fs.unlinkSync(fpath);
      this.logger.log(`[TTS] Deleted ${language} cache for page #${pageId}`);
    }
  }

  // ── Provider dispatch ──────────────────────────────────────────────────────

  /**
   * Integration points for real TTS providers.
   * Each case must return a Buffer (MP3 bytes).
   *
   * Required .env vars:
   *   GOOGLE:     GOOGLE_TTS_KEY_FILE=path/to/service-account.json
   *   ELEVENLABS: ELEVENLABS_API_KEY
   *   AWS_POLLY:  AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
   */
  private async dispatchTts(
    provider: string,
    script: string,
    language: 'BN' | 'EN',
    settings: TtsSettings,
  ): Promise<Buffer> {
    switch (provider) {
      // ── Google Cloud TTS ─────────────────────────────────────────────────
      // npm i @google-cloud/text-to-speech
      case 'GOOGLE': {
        // const textToSpeech = require('@google-cloud/text-to-speech');
        // const client = new textToSpeech.TextToSpeechClient({ keyFilename: process.env.GOOGLE_TTS_KEY_FILE });
        // const langCode  = language === 'BN' ? 'bn-BD' : 'en-US';
        // const voiceName = settings.voiceId || (language === 'BN' ? 'bn-BD-Standard-A' : 'en-US-Standard-C');
        // const [resp] = await client.synthesizeSpeech({
        //   input:  { text: script },
        //   voice:  { languageCode: langCode, name: voiceName, ssmlGender: settings.voiceType === 'MALE' ? 'MALE' : 'FEMALE' },
        //   audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
        // });
        // return Buffer.from(resp.audioContent);
        throw new Error(
          'GOOGLE TTS not yet configured — add GOOGLE_TTS_KEY_FILE to .env and uncomment the code',
        );
      }

      // ── ElevenLabs ───────────────────────────────────────────────────────
      // Uses Node 18+ native fetch
      case 'ELEVENLABS': {
        // const voiceId = settings.voiceId || '21m00Tcm4TlvDq8ikWAM'; // default: Rachel
        // const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        //   method:  'POST',
        //   headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
        //   body:    JSON.stringify({ text: script, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
        // });
        // if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
        // return Buffer.from(await resp.arrayBuffer());
        throw new Error(
          'ELEVENLABS not yet configured — add ELEVENLABS_API_KEY to .env and uncomment the code',
        );
      }

      // ── AWS Polly ────────────────────────────────────────────────────────
      // npm i @aws-sdk/client-polly
      case 'AWS_POLLY': {
        // const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
        // const client  = new PollyClient({ region: process.env.AWS_REGION });
        // const voiceId = settings.voiceId || (language === 'BN' ? 'Kajal' : 'Joanna');
        // const { AudioStream } = await client.send(new SynthesizeSpeechCommand({
        //   Text: script, OutputFormat: 'mp3', VoiceId: voiceId, Engine: 'neural',
        //   LanguageCode: language === 'BN' ? 'bn-IN' : 'en-US',
        // }));
        // const chunks: Buffer[] = [];
        // for await (const chunk of AudioStream as any) chunks.push(Buffer.from(chunk));
        // return Buffer.concat(chunks);
        throw new Error(
          'AWS_POLLY not yet configured — add AWS credentials to .env and uncomment the code',
        );
      }

      default:
        throw new Error(`Unknown TTS provider: "${provider}"`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private filename(language: string): string {
    return (language || 'BN').toUpperCase() === 'EN'
      ? 'en-confirm.mp3'
      : 'bn-confirm.mp3';
  }

  private toPublicUrl(pageId: number, fname: string): string {
    const base = (
      process.env.STORAGE_PUBLIC_URL || 'http://localhost:3000/storage'
    ).replace(/\/$/, '');
    return `${base}/call-voices/page-${pageId}/${fname}`;
  }
}
