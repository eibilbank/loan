
import { 
  LoanApplication, 
  InternalCreditScore, 
  RiskCategory, 
  RiskFlag, 
  ResidenceType, 
  EmploymentType 
} from '../types';
import { BASE_SCORE, MIN_SCORE, MAX_SCORE } from '../constants';

export const calculateInternalCreditScore = (app: LoanApplication): InternalCreditScore => {
  let score = BASE_SCORE;
  const flags: RiskFlag[] = [];
  
  // 1. Bank Statement Behavior (40%)
  let bankPoints = 0;
  const analysis = app.statementAnalysis;
  if (analysis) {
    if (analysis.avgMonthlyBalance > 50000) bankPoints += 80;
    if (analysis.salaryCredits > 0) bankPoints += 70;
    if (analysis.bounces === 0) bankPoints += 60;
    if (analysis.negativeBalanceDays > 2) {
      bankPoints -= 100;
      flags.push({ code: 'NEGATIVE_BALANCE', severity: 'HIGH', description: 'Recent negative balance instances detected' });
    }
    if (analysis.bounces > 0) {
      flags.push({ code: 'BOUNCE_DETECTED', severity: 'HIGH', description: 'Cheque/NACH bounce history' });
    }
    if (analysis.existingEmis > 2) bankPoints -= 60;
  }

  // 2. Income & Employment (25%)
  let incomePoints = 0;
  if (app.employmentType === EmploymentType.SALARIED) incomePoints += 70;
  if (app.monthlyIncome < 15000) {
    incomePoints -= 60;
    flags.push({ code: 'LOW_INCOME', severity: 'MEDIUM', description: 'Net monthly income below risk threshold' });
  } else if (app.monthlyIncome > 100000) {
    incomePoints += 30;
  }

  // 3. Residence Type (10%)
  let resPoints = 0;
  if (app.residenceType === ResidenceType.OWN) resPoints += 50;
  if (app.residenceType === ResidenceType.RENTED) {
    resPoints -= 40;
    flags.push({ code: 'RENTED_RESIDENCE', severity: 'LOW', description: 'Applicant resides in rented property' });
  }

  // 4. KYC Strength (10%)
  let kycPoints = 50; // Assume verified for this simulation

  // 5. Credit Discipline (10%)
  let discPoints = 0;
  const dti = analysis ? (analysis.emiAmount / app.monthlyIncome) : 0;
  if (dti <= 0.4) discPoints += 40;
  else if (dti > 0.5) {
    discPoints -= 80;
    flags.push({ code: 'HIGH_DTI', severity: 'HIGH', description: 'Debt-to-Income ratio exceeds 50%' });
  }

  // 6. Stability (5%)
  let stabPoints = 20;

  score += (bankPoints + incomePoints + resPoints + kycPoints + discPoints + stabPoints);
  score = Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));

  let category = RiskCategory.VERY_HIGH;
  if (score >= 750) category = RiskCategory.LOW;
  else if (score >= 650) category = RiskCategory.MEDIUM;
  else if (score >= 550) category = RiskCategory.HIGH;

  return {
    score,
    factors: {
      bankBehavior: bankPoints,
      incomeEmployment: incomePoints,
      residence: resPoints,
      kyc: kycPoints,
      discipline: discPoints,
      stability: stabPoints
    },
    riskFlags: flags,
    category
  };
};

export const generateLoanOffer = (app: LoanApplication, score: InternalCreditScore) => {
  const maxEmi = app.monthlyIncome * 0.4;
  let roi = 12.0;
  let tenure = 24;
  let amountMultiplier = 5;

  switch (score.category) {
    case RiskCategory.LOW:
      roi = 10.5;
      tenure = 36;
      amountMultiplier = 12;
      break;
    case RiskCategory.MEDIUM:
      roi = 14.5;
      tenure = 24;
      amountMultiplier = 8;
      break;
    case RiskCategory.HIGH:
      roi = 19.5;
      tenure = 12;
      amountMultiplier = 4;
      break;
    case RiskCategory.VERY_HIGH:
      roi = 24.0;
      tenure = 6;
      amountMultiplier = 2;
      break;
  }

  const principal = Math.min(app.monthlyIncome * amountMultiplier, 500000);
  const monthlyRoi = roi / 12 / 100;
  const emi = (principal * monthlyRoi * Math.pow(1 + monthlyRoi, tenure)) / (Math.pow(1 + monthlyRoi, tenure) - 1);

  return {
    amount: Math.round(principal / 1000) * 1000,
    roi,
    tenure,
    emi: Math.round(emi)
  };
};
