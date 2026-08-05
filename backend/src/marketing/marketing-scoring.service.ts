import { Injectable } from '@nestjs/common';
import { MarketingSettingsService } from './marketing-settings.service';

// V30 Phase 1: configurable lead-scoring engine. Weights live in
// MarketingSettings.scoringWeightsJson (admin-editable); these are just the
// fallback defaults for any weight the admin hasn't overridden. Only uses
// signals a human can enter manually today (no AI pain-point signals yet —
// those arrive in Phase 2 and get their own weight once they exist).
export interface ScoringWeights {
  hasFacebook: number;
  hasWebsite: number;
  followers10k: number;
  followers50k: number;
  reviewCountThreshold: number; // not a weight — the count a lead must reach
  highReviewCount: number;
  onlineOrderPresence: number;
  highMessageVolume: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  hasFacebook: 10,
  hasWebsite: 10,
  followers10k: 15,
  followers50k: 20,
  reviewCountThreshold: 20,
  highReviewCount: 10,
  onlineOrderPresence: 15,
  highMessageVolume: 15,
};

export interface ScorableLead {
  facebookUrl?: string | null;
  website?: string | null;
  followerCount?: number | null;
  reviewCount?: number | null;
  onlineOrderPresence?: boolean | null;
  estimatedMessageVolume?: string | null;
}

@Injectable()
export class MarketingScoringService {
  constructor(private readonly settingsService: MarketingSettingsService) {}

  async scoreLead(
    lead: ScorableLead,
  ): Promise<{ score: number; temperature: string }> {
    const { scoringWeights } = await this.settingsService.get();
    const w: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS, ...scoringWeights };

    let score = 0;
    if (lead.facebookUrl) score += w.hasFacebook;
    if (lead.website) score += w.hasWebsite;
    const followers = Number(lead.followerCount) || 0;
    if (followers >= 50000) score += w.followers50k;
    else if (followers >= 10000) score += w.followers10k;
    if ((Number(lead.reviewCount) || 0) >= w.reviewCountThreshold)
      score += w.highReviewCount;
    if (lead.onlineOrderPresence) score += w.onlineOrderPresence;
    if (lead.estimatedMessageVolume === 'high') score += w.highMessageVolume;

    score = Math.max(0, Math.min(100, Math.round(score)));
    const temperature =
      score >= 80
        ? 'HOT'
        : score >= 60
          ? 'WARM'
          : score >= 40
            ? 'POTENTIAL'
            : 'LOW_PRIORITY';
    return { score, temperature };
  }
}
