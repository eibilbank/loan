
export enum ResidenceType {
  OWN = 'OWN',
  FAMILY = 'FAMILY',
  RENTED = 'RENTED'
}

export enum EmploymentType {
  SALARIED = 'SALARIED',
  SELF_EMPLOYED = 'SELF_EMPLOYED'
}

export enum RiskCategory {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  VERY_HIGH = 'VERY_HIGH'
}

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

export interface BankStatementAnalysis {
  avgMonthlyBalance: number;
  salaryCredits: number;
  existingEmis: number;
  emiAmount: number;
  bounces: number;
  negativeBalanceDays: number;
  incomeStabilityScore: number; // 0-100
  summary: string;
}

export interface LivenessResult {
  isLive: boolean;
  confidenceScore: number;
  reasoning: string;
}

export type VideoKycStatus = 'NOT_STARTED' | 'IN_QUEUE' | 'PENDING' | 'COMPLETED' | 'FAILED';

export interface RiskFlag {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}

export interface InternalCreditScore {
  score: number;
  factors: {
    bankBehavior: number;
    incomeEmployment: number;
    residence: number;
    kyc: number;
    discipline: number;
    stability: number;
  };
  riskFlags: RiskFlag[];
  category: RiskCategory;
}

export interface AuditLog {
  id: string;
  entityId: string;
  action: 'APPROVE' | 'REJECT' | 'MODIFY' | 'OVERRIDE' | 'VKYC_INIT' | 'VKYC_COMPLETED' | 'VKYC_FAILED' | 'PAN_VERIFIED' | 'AADHAAR_VERIFIED';
  actor: string;
  details: string;
  timestamp: string;
}

export interface LoanApplication {
  id: string;
  status: 'DRAFT' | 'VERIFIED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  mobileNumber: string;
  fullName: string;
  dob: string;
  gender: string;
  panNumber: string;
  panStatus: VerificationStatus;
  aadhaarNumber: string;
  aadhaarStatus: VerificationStatus;
  currentAddress: string;
  residenceType: ResidenceType;
  employmentType: EmploymentType;
  companyName: string;
  monthlyIncome: number;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  panCardPhoto?: string;
  liveSelfie?: string;
  livenessResult?: LivenessResult;
  videoKycStatus: VideoKycStatus;
  aadhaarVerified: boolean;
  statementAnalysis?: BankStatementAnalysis;
  creditScore?: InternalCreditScore;
  loanOffer?: {
    amount: number;
    roi: number;
    tenure: number;
    emi: number;
  };
  emiDeductionMethod: 'e-NACH' | 'Physical Mandate' | 'Manual';
  emiDeductionDate: number;
  createdAt: string;
}

export interface UserSession {
  isVerified: boolean;
  mobileNumber: string;
}
