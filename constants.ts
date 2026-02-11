
export const SCORING_WEIGHTS = {
  BANK_BEHAVIOR: 0.40,
  INCOME_EMPLOYMENT: 0.25,
  RESIDENCE: 0.10,
  KYC: 0.10,
  DISCIPLINE: 0.10,
  STABILITY: 0.05
};

export const BASE_SCORE = 450;
export const MIN_SCORE = 300;
export const MAX_SCORE = 900;

export const RISK_LEVELS = {
  LOW: { min: 750, max: 900, baseRoi: 10.5, maxTenure: 36 },
  MEDIUM: { min: 650, max: 749, baseRoi: 14.0, maxTenure: 24 },
  HIGH: { min: 550, max: 649, baseRoi: 18.0, maxTenure: 12 },
  VERY_HIGH: { min: 300, max: 549, baseRoi: 24.0, maxTenure: 6 }
};
