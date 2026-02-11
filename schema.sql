
-- Database Schema for FinRisk Pro Loan System

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mobile_number VARCHAR(15) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE otp_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mobile_number VARCHAR(15) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE loan_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'DRAFT',
    full_name VARCHAR(255),
    dob DATE,
    gender VARCHAR(10),
    pan_number VARCHAR(10), -- Encrypted in production
    aadhaar_number VARCHAR(12), -- Masked/Encrypted
    current_address TEXT,
    residence_type VARCHAR(20),
    employment_type VARCHAR(20),
    company_name VARCHAR(255),
    monthly_income NUMERIC(15, 2),
    bank_name VARCHAR(100),
    account_number VARCHAR(30),
    ifsc_code VARCHAR(11),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bank_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES loan_applications(id),
    file_path TEXT,
    avg_balance NUMERIC(15, 2),
    salary_credits NUMERIC(15, 2),
    bounces INT,
    negative_days INT,
    analysis_json JSONB
);

CREATE TABLE credit_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES loan_applications(id),
    score INT CHECK (score BETWEEN 300 AND 900),
    risk_category VARCHAR(20),
    factor_breakdown JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE risk_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES loan_applications(id),
    flag_code VARCHAR(50),
    severity VARCHAR(20),
    description TEXT
);

CREATE TABLE loan_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES loan_applications(id),
    sanctioned_amount NUMERIC(15, 2),
    roi NUMERIC(5, 2),
    tenure INT,
    emi NUMERIC(15, 2),
    is_accepted BOOLEAN DEFAULT FALSE
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID,
    action VARCHAR(100),
    actor VARCHAR(100),
    old_value JSONB,
    new_value JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
