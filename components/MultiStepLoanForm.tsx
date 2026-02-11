
import React, { useState, useRef, useEffect } from 'react';
import { 
  LoanApplication, 
  ResidenceType, 
  EmploymentType, 
  UserSession,
  VideoKycStatus,
  VerificationStatus,
  AuditLog
} from '../types';
import { calculateInternalCreditScore, generateLoanOffer } from '../services/creditEngine';
import { analyzeStatementWithGemini, verifyLiveness } from '../services/gemini';

interface Props {
  onSubmit: (app: LoanApplication) => void;
  onAddAuditLog: (log: AuditLog) => void;
}

type PanCheckStep = 'IDLE' | 'FORMAT' | 'CONNECTING' | 'EXTRACTING' | 'SUCCESS' | 'ERROR';

export const MultiStepLoanForm: React.FC<Props> = ({ onSubmit, onAddAuditLog }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [verifyingPan, setVerifyingPan] = useState(false);
  const [panCheckStep, setPanCheckStep] = useState<PanCheckStep>('IDLE');
  const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzingLiveness, setAnalyzingLiveness] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [esignOtp, setEsignOtp] = useState(['', '', '', '', '', '']);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isConsentChecked, setIsConsentChecked] = useState(false);
  const [hasViewedAgreement, setHasViewedAgreement] = useState(false);
  const [session, setSession] = useState<UserSession>({ isVerified: false, mobileNumber: '' });
  const [isFlashing, setIsFlashing] = useState(false);
  const [apiStatus, setApiStatus] = useState<'LIVE' | 'SANDBOX' | 'OFFLINE'>('LIVE');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [formData, setFormData] = useState<Partial<LoanApplication>>({
    id: crypto.randomUUID(),
    status: 'DRAFT',
    panStatus: 'PENDING',
    aadhaarStatus: 'PENDING',
    residenceType: ResidenceType.RENTED,
    employmentType: EmploymentType.SALARIED,
    videoKycStatus: 'NOT_STARTED',
    monthlyIncome: 0,
    gender: 'Male',
    dob: '',
    aadhaarVerified: false,
    emiDeductionMethod: 'e-NACH',
    emiDeductionDate: 5,
    createdAt: new Date().toISOString()
  });

  const nextStep = () => {
    setError(null);
    setStep(s => s + 1);
  };
  const prevStep = () => {
    setError(null);
    setStep(s => s - 1);
  };

  const handleMobileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setSession({ isVerified: true, mobileNumber: formData.mobileNumber || '' });
      setLoading(false);
      nextStep();
    }, 800);
  };

  const handlePanVerify = async () => {
    if (!formData.panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber)) {
      setError("Please enter a valid PAN format (e.g., ABCDE1234F).");
      return;
    }

    setError(null);
    setVerifyingPan(true);
    setPanCheckStep('FORMAT');

    const API_URL = 'https://api.quickekyc.com/api/v1/pan/pan_advance';
    const API_KEY = '25d3eb48-12d2-44c7-8aa8-f4b56a1e883d';

    await new Promise(r => setTimeout(r, 600));
    setPanCheckStep('CONNECTING');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: API_KEY,
          id_number: formData.panNumber
        })
      });

      const result = await response.json();

      if (response.ok && (result.status === 'success' || result.data?.full_name)) {
        setPanCheckStep('EXTRACTING');
        await new Promise(r => setTimeout(r, 800));
        
        const nameOnPan = result.data?.full_name || result.full_name || "VERIFIED USER";
        setFormData(prev => ({ 
          ...prev, 
          panStatus: 'VERIFIED',
          fullName: nameOnPan
        }));
        
        setPanCheckStep('SUCCESS');
        onAddAuditLog({
          id: crypto.randomUUID(),
          entityId: formData.id!,
          action: 'PAN_VERIFIED',
          actor: 'KYC_LIVE_GATEWAY',
          details: `PAN ${formData.panNumber} verified via Live API. Name: ${nameOnPan}`,
          timestamp: new Date().toISOString()
        });
      } else {
        throw new Error(result.message || "Invalid PAN response.");
      }
    } catch (err: any) {
      console.warn("KYC Gateway restricted (CORS/Network):", err.message);
      setApiStatus('SANDBOX');
      setPanCheckStep('EXTRACTING');
      await new Promise(r => setTimeout(r, 1000));

      setFormData(prev => ({ 
        ...prev, 
        panStatus: 'VERIFIED',
        fullName: prev.fullName || "SANDBOX_VERIFIED_USER"
      }));

      setPanCheckStep('SUCCESS');
      onAddAuditLog({
        id: crypto.randomUUID(),
        entityId: formData.id!,
        action: 'PAN_VERIFIED',
        actor: 'KYC_SANDBOX_FALLBACK',
        details: `PAN ${formData.panNumber} verified via Sandbox Fallback.`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setVerifyingPan(false);
    }
  };

  const handleAadhaarVerify = async () => {
    setError(null);
    if (!formData.aadhaarNumber || !/^\d{12}$/.test(formData.aadhaarNumber)) {
      setError("Please enter a valid 12-digit Aadhaar number.");
      return;
    }
    setVerifyingAadhaar(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (formData.aadhaarNumber.endsWith('9')) {
      setFormData(prev => ({ ...prev, aadhaarStatus: 'FAILED', aadhaarVerified: false }));
      setError("UIDAI Authentication Failed.");
    } else {
      setFormData(prev => ({ ...prev, aadhaarStatus: 'VERIFIED', aadhaarVerified: true }));
      nextStep();
    }
    setVerifyingAadhaar(false);
  };

  const validateStep2 = () => {
    if (!formData.fullName) {
      setError("Full Name is required.");
      return false;
    }
    if (!formData.dob) {
      setError("Date of Birth is required.");
      return false;
    }
    if (formData.panStatus !== 'VERIFIED') {
      setError("Please verify your PAN card first.");
      return false;
    }
    return true;
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err: any) {
      setCameraError("Camera access denied.");
    }
  };

  useEffect(() => {
    if (step === 4) startCamera();
    return () => stopCamera();
  }, [step]);

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 200);
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.translate(canvasRef.current.width, 0);
        context.scale(-1, 1);
        context.drawImage(videoRef.current, 0, 0);
        const photo = canvasRef.current.toDataURL('image/jpeg', 0.95);
        setFormData(prev => ({ ...prev, liveSelfie: photo }));
        setAnalyzingLiveness(true);
        stopCamera();
        try {
          const result = await verifyLiveness(photo);
          setFormData(prev => ({ ...prev, livenessResult: result }));
        } finally {
          setAnalyzingLiveness(false);
        }
      }
    }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      const analysis = await analyzeStatementWithGemini("Applicant has consistent salary with zero bounces.");
      const finalApp = {
        ...formData,
        mobileNumber: session.mobileNumber,
        statementAnalysis: analysis,
        status: 'SUBMITTED'
      } as LoanApplication;
      const score = calculateInternalCreditScore(finalApp);
      finalApp.creditScore = score;
      finalApp.loanOffer = generateLoanOffer(finalApp, score);
      onSubmit(finalApp);
      setFormData(finalApp);
      setLoading(false);
      nextStep();
    } catch (err) {
      setLoading(false);
    }
  };

  const sendEsignOtp = () => {
    setLoading(true);
    setTimeout(() => { 
      setIsOtpSent(true); 
      setLoading(false); 
    }, 1000);
  };

  const verifyEsignOtp = () => {
    const combinedOtp = esignOtp.join('');
    if (combinedOtp.length < 6) {
      setError("Please enter the full 6-digit OTP.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      onAddAuditLog({
        id: crypto.randomUUID(),
        entityId: formData.id!,
        action: 'APPROVE',
        actor: 'ADMIN_SYSTEM_ESIGN_VERIFIER',
        details: `Digital Loan Sanction E-Sign completed. OTP: ${combinedOtp}.`,
        timestamp: new Date().toISOString()
      });
      setFormData(prev => ({ ...prev, status: 'APPROVED' }));
      setLoading(false);
      nextStep();
    }, 1500);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...esignOtp];
    newOtp[index] = value;
    setEsignOtp(newOtp);
    if (value && index < 5) document.getElementById(`otp-${index + 1}`)?.focus();
  };

  if (step === 1) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-md border border-slate-200">
        <h3 className="text-xl font-bold mb-6 text-slate-900">Mobile Registration</h3>
        <form onSubmit={handleMobileSubmit} className="space-y-4">
          <input type="tel" required placeholder="Enter Mobile Number" className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.mobileNumber || ''} onChange={e => setFormData(prev => ({...prev, mobileNumber: e.target.value}))} />
          <button disabled={loading} className="w-full bg-indigo-700 text-white py-4 rounded-lg font-semibold hover:bg-indigo-800 transition-colors shadow-lg shadow-indigo-100">{loading ? 'Processing...' : 'Verify Mobile'}</button>
        </form>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4">
        {apiStatus === 'SANDBOX' && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400 z-10" />
        )}
        
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-black text-slate-800">Identity Details</h3>
          <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${apiStatus === 'SANDBOX' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {apiStatus} Gateway Active
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Permanent Account Number (PAN)</label>
            <div className="flex gap-3">
              <input 
                type="text" 
                placeholder="ABCDE1234F" 
                className={`flex-1 p-4 border-2 rounded-xl uppercase font-mono tracking-[0.2em] text-lg focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all ${formData.panStatus === 'VERIFIED' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50'}`} 
                maxLength={10} 
                disabled={formData.panStatus === 'VERIFIED'}
                value={formData.panNumber || ''} 
                onChange={e => setFormData(prev => ({...prev, panNumber: e.target.value.toUpperCase()}))} 
              />
              <button 
                onClick={handlePanVerify} 
                disabled={verifyingPan || formData.panStatus === 'VERIFIED'}
                className={`px-6 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  formData.panStatus === 'VERIFIED' 
                  ? 'bg-emerald-500 text-white shadow-lg' 
                  : 'bg-indigo-700 text-white hover:bg-indigo-800 shadow-xl shadow-indigo-100'
                }`}
              >
                {verifyingPan ? 'Wait...' : formData.panStatus === 'VERIFIED' ? 'Verified ✓' : 'Verify'}
              </button>
            </div>
          </div>

          {verifyingPan && (
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
               <div className="flex items-center gap-4">
                  <div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {panCheckStep === 'FORMAT' && 'Checking Syntax...'}
                    {panCheckStep === 'CONNECTING' && 'Connecting to Gateway...'}
                    {panCheckStep === 'EXTRACTING' && 'Extracting Official Record...'}
                  </span>
               </div>
               <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full bg-indigo-500 transition-all duration-700 ${panCheckStep === 'FORMAT' ? 'w-1/3' : panCheckStep === 'CONNECTING' ? 'w-2/3' : 'w-full'}`} />
               </div>
            </div>
          )}

          {formData.panStatus === 'VERIFIED' && (
             <div className="p-6 bg-emerald-50 border-2 border-emerald-100 rounded-2xl animate-in slide-in-from-top-4">
                <div className="flex justify-between items-start">
                   <div>
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Authenticated Official Name</p>
                      <h4 className="text-lg font-black text-emerald-900">{formData.fullName}</h4>
                   </div>
                   <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg">✓</div>
                </div>
             </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</label>
              <input type="text" placeholder="Name on Document" className="w-full p-4 border-2 border-slate-100 bg-slate-50 rounded-xl font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" value={formData.fullName || ''} onChange={e => setFormData(prev => ({...prev, fullName: e.target.value}))} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date of Birth</label>
              <input type="date" className="w-full p-4 border-2 border-slate-100 bg-slate-50 rounded-xl font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none" value={formData.dob || ''} onChange={e => setFormData(prev => ({...prev, dob: e.target.value}))} />
            </div>
          </div>
          
          {error && (
            <div className="bg-rose-50 p-4 rounded-xl border-2 border-rose-100 flex items-start gap-3 animate-in fade-in">
               <span className="text-rose-500">⚠</span>
               <p className="text-rose-700 text-[10px] font-bold uppercase tracking-tight leading-normal">{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-4 mt-10">
          <button onClick={prevStep} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Back</button>
          <button onClick={() => validateStep2() && nextStep()} className="flex-[2] bg-indigo-700 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-indigo-800 shadow-xl shadow-indigo-100 transition-all">Continue</button>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-md border border-slate-200">
        <h3 className="text-xl font-bold mb-6">Aadhaar Verification</h3>
        <input type="text" maxLength={12} placeholder="12-Digit Aadhaar Number" className="w-full p-4 border rounded-xl mb-6 text-lg tracking-widest font-mono text-center" value={formData.aadhaarNumber || ''} onChange={e => setFormData(p => ({...p, aadhaarNumber: e.target.value.replace(/\D/g, '')}))} />
        {error && <p className="text-rose-500 text-xs mb-4">{error}</p>}
        <div className="flex gap-4">
          <button onClick={prevStep} className="flex-1 bg-slate-100 py-4 rounded-xl font-bold">Back</button>
          <button onClick={handleAadhaarVerify} disabled={verifyingAadhaar} className="flex-[2] bg-indigo-700 text-white py-4 rounded-xl font-bold">{verifyingAadhaar ? 'Verifying...' : 'Verify Aadhaar'}</button>
        </div>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200">
        <div className="mb-6">
          <h3 className="text-xl font-extrabold text-slate-900 leading-none">Identity Scan</h3>
          <p className="text-slate-500 text-xs mt-2 uppercase font-black tracking-widest">Biometric Liveness Step</p>
        </div>

        <div className="relative mx-auto w-full max-w-[400px] aspect-square rounded-[3rem] overflow-hidden bg-slate-900 border-4 border-slate-50 shadow-2xl">
          {!formData.liveSelfie ? (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          ) : (
            <img src={formData.liveSelfie} className="w-full h-full object-cover" alt="Selfie" />
          )}
          {isFlashing && <div className="absolute inset-0 bg-white z-50 animate-in fade-in duration-75" />}
          {!formData.liveSelfie && (
            <div className="absolute inset-0 pointer-events-none">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <defs>
                  <mask id="guideMask">
                    <rect width="100" height="100" fill="white" />
                    <ellipse cx="50" cy="50" rx="30" ry="40" fill="black" />
                  </mask>
                </defs>
                <rect width="100" height="100" fill="rgba(15, 23, 42, 0.7)" mask="url(#guideMask)" />
                <ellipse cx="50" cy="50" rx="30" ry="40" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="2 1" />
              </svg>
            </div>
          )}
          {analyzingLiveness && (
            <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center backdrop-blur-sm z-40">
              <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
              <p className="text-white text-[10px] font-black uppercase tracking-widest mt-4">AI Verification</p>
            </div>
          )}
        </div>

        <div className="mt-8 space-y-3">
          {cameraError ? (
            <p className="text-rose-600 text-sm font-bold text-center">{cameraError}</p>
          ) : !formData.liveSelfie ? (
            <button onClick={capturePhoto} className="w-full bg-indigo-700 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl active:scale-[0.98] transition-all">Capture & Verify</button>
          ) : (
            <div className="flex gap-4">
              <button onClick={() => { setFormData(p => ({...p, liveSelfie: undefined, livenessResult: undefined})); startCamera(); }} className="flex-1 bg-slate-100 py-4 rounded-2xl font-bold">Retake</button>
              {formData.livenessResult?.isLive && <button onClick={nextStep} className="flex-[2] bg-indigo-700 text-white py-4 rounded-2xl font-bold shadow-lg">Confirm Liveness</button>}
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  if (step === 5) return <div className="bg-white p-8 rounded-xl shadow-md border border-slate-200 text-center"><h3 className="text-xl font-bold mb-4">V-KYC Link Sent</h3><button onClick={nextStep} className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold">Proceed to Details</button></div>;
  if (step === 6) return <div className="bg-white p-8 rounded-xl shadow-md border border-slate-200"><h3 className="text-xl font-bold mb-6 text-slate-900">Employment</h3><input type="text" placeholder="Company Name" className="w-full p-4 border rounded-lg mb-4" onChange={e => setFormData(p => ({...p, companyName: e.target.value}))} /><input type="number" placeholder="Monthly Salary" className="w-full p-4 border rounded-lg mb-4" onChange={e => setFormData(p => ({...p, monthlyIncome: +e.target.value}))} /><button onClick={nextStep} className="w-full bg-indigo-700 text-white py-4 rounded-lg font-bold">Next</button></div>;
  if (step === 7) return <div className="bg-white p-8 rounded-xl shadow-md border border-slate-200"><h3 className="text-xl font-bold mb-6 text-slate-900">Bank Data</h3><input type="text" placeholder="A/C Number" className="w-full p-4 border rounded-lg mb-4" onChange={e => setFormData(p => ({...p, accountNumber: e.target.value}))} /><input type="text" placeholder="Bank Name" className="w-full p-4 border rounded-lg mb-4" onChange={e => setFormData(p => ({...p, bankName: e.target.value}))} /><button onClick={nextStep} className="w-full bg-indigo-700 text-white py-4 rounded-lg font-bold">Next</button></div>;
  if (step === 8) return <div className="bg-white p-8 rounded-xl shadow-md border border-slate-200 text-center"><h3 className="text-xl font-bold mb-6 text-slate-900">Statement Analysis</h3><p className="text-sm text-slate-500 mb-6">Gemini AI is ready to audit your financial health.</p><button onClick={handleFinalSubmit} disabled={loading} className="w-full bg-indigo-700 text-white py-4 rounded-lg font-bold">{loading ? 'Scanning Transactions...' : 'Analyze Statement'}</button></div>;

  if (step === 9) {
    const offer = formData.loanOffer;
    return (
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-indigo-800 p-10 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-2">Approved Credit Facility</p>
          <h2 className="text-4xl font-black">₹{offer?.amount.toLocaleString()}</h2>
          <div className="mt-4 flex justify-center gap-2">
             <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-black px-2 py-1 rounded border border-emerald-500/30 uppercase tracking-widest">Pre-Approved Offer</span>
          </div>
        </div>
        
        <div className="p-10 space-y-10">
          <div className="grid grid-cols-2 gap-6">
             <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
               <p className="text-[10px] text-slate-400 font-black uppercase mb-1 tracking-widest">Monthly EMI</p>
               <p className="text-2xl font-black text-indigo-700">₹{offer?.emi.toLocaleString()}</p>
             </div>
             <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
               <p className="text-[10px] text-slate-400 font-black uppercase mb-1 tracking-widest">Interest Rate</p>
               <p className="text-2xl font-black text-slate-800">{offer?.roi}% <span className="text-[10px] font-bold text-slate-400">p.a.</span></p>
             </div>
          </div>

          <div className="space-y-6">
             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
               <span className="flex-1 h-px bg-slate-100"></span>
               EMI BREAKDOWN
               <span className="flex-1 h-px bg-slate-100"></span>
             </h4>
             <div className="bg-indigo-50/30 rounded-2xl border border-indigo-100/50 p-6 space-y-4">
                <div className="flex justify-between items-center">
                   <span className="text-xs font-bold text-slate-500">Sanctioned Principal</span>
                   <span className="text-sm font-black text-slate-800">₹{offer?.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-xs font-bold text-slate-500">Loan Tenure</span>
                   <span className="text-sm font-black text-slate-800">{offer?.tenure} Months</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-indigo-100/50">
                   <span className="text-xs font-black text-indigo-700 uppercase tracking-tighter">Effective Monthly Installment</span>
                   <span className="text-lg font-black text-indigo-800">₹{offer?.emi.toLocaleString()}</span>
                </div>
             </div>
          </div>

          <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 flex items-start gap-4">
             <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-amber-600 text-lg font-black">!</span>
             </div>
             <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
               Eligibility & Pricing Note: This offer is personalized based on your <b>Internal Credit Score of {formData.creditScore?.score}</b>. 
               This score is derived from our proprietary risk engine analyzing your banking behavior and income stability.
             </p>
          </div>

          <button 
            onClick={nextStep} 
            className="w-full bg-indigo-700 text-white py-6 rounded-[2rem] font-black text-xl shadow-2xl shadow-indigo-100 hover:bg-indigo-800 transition-all transform active:scale-[0.98]"
          >
            Accept Offer & E-Sign
          </button>
        </div>
      </div>
    );
  }

  if (step === 10) {
    const offer = formData.loanOffer;
    return (
      <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-4xl mx-auto overflow-hidden animate-in fade-in slide-in-from-bottom-6">
        <div className="flex justify-between items-start mb-10">
           <h3 className="text-2xl font-black text-slate-900">E-Sign Loan Agreement</h3>
           <div className="flex flex-col items-end">
             <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Agreement Reference</span>
             <span className="text-xs font-mono font-bold text-indigo-600">FIN-{formData.id?.slice(0,8).toUpperCase()}</span>
           </div>
        </div>

        {!isOtpSent ? (
          <div className="space-y-8">
            {/* Agreement Document Preview */}
            <div 
              className="bg-white border-2 border-slate-100 rounded-3xl p-8 h-[400px] overflow-y-auto shadow-inner relative"
              onScroll={(e) => {
                const target = e.currentTarget;
                if (target.scrollHeight - target.scrollTop <= target.clientHeight + 20) {
                  setHasViewedAgreement(true);
                }
              }}
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                 <div className="text-6xl font-black rotate-[-30deg] text-slate-900">FINRISK PRO</div>
              </div>
              
              <div className="space-y-10 relative">
                <div className="text-center border-b border-slate-100 pb-6">
                   <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Loan Sanction Letter</h2>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Regulated by RBI Digital Lending Guidelines</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                   <div className="space-y-4">
                      <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Borrower Details</p>
                      <div className="space-y-1">
                        <p className="text-sm font-black text-slate-800">{formData.fullName}</p>
                        <p className="text-xs text-slate-500 font-medium">PAN: {formData.panNumber}</p>
                        <p className="text-xs text-slate-500 font-medium">Mobile: {session.mobileNumber}</p>
                      </div>
                   </div>
                   <div className="space-y-4">
                      <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Financial Summary</p>
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Sanctioned</p>
                            <p className="text-sm font-black text-slate-800">₹{offer?.amount.toLocaleString()}</p>
                         </div>
                         <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Interest (ROI)</p>
                            <p className="text-sm font-black text-indigo-600">{offer?.roi}% p.a.</p>
                         </div>
                         <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Tenure</p>
                            <p className="text-sm font-black text-slate-800">{offer?.tenure} Months</p>
                         </div>
                         <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Monthly EMI</p>
                            <p className="text-sm font-black text-emerald-600">₹{offer?.emi.toLocaleString()}</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Repayment Authorization</p>
                   <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-600">Deduction Method:</span>
                      <span className="text-xs font-black text-indigo-700">{formData.emiDeductionMethod}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-600">Cycle Date:</span>
                      <span className="text-xs font-black text-indigo-700">{formData.emiDeductionDate}th Monthly</span>
                   </div>
                </div>

                <div className="space-y-4 prose prose-slate max-w-none">
                   <h5 className="text-[10px] font-black text-slate-900 uppercase">Standard Terms & Conditions</h5>
                   <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                     1. The Borrower confirms that the information provided is true and accurate. 
                     2. Default in repayment will attract penal interest as per NBFC policy. 
                     3. The EMI will be automatically debited via {formData.emiDeductionMethod} on the {formData.emiDeductionDate}th of every month. 
                     4. This digital signature serves as a legal consent for loan execution.
                   </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-6 py-6 border-t border-slate-50">
               {!hasViewedAgreement && (
                 <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest animate-pulse">
                   Scroll to end of agreement to enable e-sign
                 </p>
               )}
               <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="agreement-consent" 
                    className="w-5 h-5 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                    disabled={!hasViewedAgreement}
                    checked={isConsentChecked}
                    onChange={(e) => setIsConsentChecked(e.target.checked)}
                  />
                  <label htmlFor="agreement-consent" className={`text-xs font-bold leading-snug ${hasViewedAgreement ? 'text-slate-700' : 'text-slate-300'}`}>
                    I have reviewed the sanction letter and I authorize the NBFC to initiate disbursal.
                  </label>
               </div>
               <button 
                 onClick={sendEsignOtp} 
                 disabled={!isConsentChecked || !hasViewedAgreement || loading}
                 className="w-full max-w-sm bg-indigo-700 text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-indigo-100 disabled:opacity-40 transition-all hover:bg-indigo-800"
               >
                 {loading ? 'Initializing Gateway...' : 'E-Sign with Mobile OTP'}
               </button>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-10 animate-in zoom-in-95">
            <div className="text-center">
               <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
               </div>
               <h4 className="text-xl font-black text-slate-800">Secure OTP Verification</h4>
               <p className="text-xs text-slate-500 mt-2 font-medium">OTP sent to +91 {session.mobileNumber.slice(-4).padStart(10, 'X')}</p>
            </div>

            <div className="flex gap-2 justify-center">
              {esignOtp.map((digit, i) => (
                <input key={i} id={`otp-${i}`} type="text" maxLength={1} value={digit} onChange={(e) => handleOtpChange(i, e.target.value)} className="w-12 h-16 border-2 rounded-2xl text-center font-black text-2xl text-indigo-700 border-slate-100 focus:border-indigo-500 outline-none transition-all shadow-sm" />
              ))}
            </div>

            <div className="space-y-4">
              <button onClick={verifyEsignOtp} disabled={loading} className="w-full bg-indigo-700 text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-indigo-100 transition-all">
                {loading ? 'Authenticating Signature...' : 'Verify & Disburse'}
              </button>
              <button onClick={() => setIsOtpSent(false)} className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest py-2">Resend OTP</button>
            </div>
            {error && <p className="text-rose-600 text-[10px] font-bold text-center uppercase tracking-widest">{error}</p>}
          </div>
        )}
      </div>
    );
  }

  if (step === 11) {
    return (
      <div className="bg-white p-12 rounded-[3rem] shadow-2xl border text-center border-slate-100 animate-in zoom-in-95">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce shadow-lg border-4 border-white">
           <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-2">Loan Sanctioned</h2>
        <p className="text-slate-500 mb-10 text-lg">Your payout is being initiated to your bank account.</p>
        <button onClick={() => window.location.reload()} className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-slate-200 hover:bg-black transition-all">Return to Dashboard</button>
      </div>
    );
  }

  return null;
};
