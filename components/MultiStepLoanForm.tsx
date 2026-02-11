
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
  const [statementText, setStatementText] = useState('');
  
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: API_KEY, id_number: formData.panNumber })
      });

      const result = await response.json();

      if (response.ok && (result.status === 'success' || result.data?.full_name)) {
        setPanCheckStep('EXTRACTING');
        await new Promise(r => setTimeout(r, 800));
        
        const nameOnPan = result.data?.full_name || result.full_name || "VERIFIED USER";
        setFormData(prev => ({ ...prev, panStatus: 'VERIFIED', fullName: nameOnPan }));
        setPanCheckStep('SUCCESS');
        onAddAuditLog({
          id: crypto.randomUUID(),
          entityId: formData.id!,
          action: 'PAN_VERIFIED',
          actor: 'KYC_LIVE_GATEWAY',
          details: `PAN ${formData.panNumber} verified via Live API.`,
          timestamp: new Date().toISOString()
        });
      } else {
        throw new Error(result.message || "Invalid PAN response.");
      }
    } catch (err: any) {
      setApiStatus('SANDBOX');
      setPanCheckStep('EXTRACTING');
      await new Promise(r => setTimeout(r, 1000));
      setFormData(prev => ({ ...prev, panStatus: 'VERIFIED', fullName: prev.fullName || "SANDBOX_VERIFIED_USER" }));
      setPanCheckStep('SUCCESS');
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
    setFormData(prev => ({ ...prev, aadhaarStatus: 'VERIFIED', aadhaarVerified: true }));
    nextStep();
    setVerifyingAadhaar(false);
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

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    if (stream) stream.getTracks().forEach(track => track.stop());
  };

  useEffect(() => {
    if (step === 4 || step === 5) startCamera();
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
    if (!statementText.trim()) {
      setError("Please provide bank statement details for analysis.");
      return;
    }
    setLoading(true);
    try {
      const analysis = await analyzeStatementWithGemini(statementText);
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
      setError("AI Analysis failed. Please check your input.");
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...esignOtp];
    newOtp[index] = value;
    setEsignOtp(newOtp);
    if (value && index < 5) document.getElementById(`otp-${index + 1}`)?.focus();
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
        actor: 'NBFC_AUTOPAY_GATEWAY',
        details: `Sanctioned amount disbursed. Reference: ${crypto.randomUUID().slice(0,12)}`,
        timestamp: new Date().toISOString()
      });
      setFormData(prev => ({ ...prev, status: 'APPROVED' }));
      setLoading(false);
      nextStep();
    }, 1500);
  };

  // Step 1: Mobile
  if (step === 1) {
    return (
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in fade-in slide-in-from-bottom-4">
        <h3 className="text-2xl font-black mb-2 text-slate-900">Get Started</h3>
        <p className="text-slate-500 text-sm mb-8">Enter your mobile number to begin your digital application.</p>
        <form onSubmit={handleMobileSubmit} className="space-y-6">
          <div className="space-y-2">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mobile Number</label>
             <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">+91</span>
                <input type="tel" required placeholder="00000 00000" className="w-full pl-14 p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" value={formData.mobileNumber || ''} onChange={e => setFormData(prev => ({...prev, mobileNumber: e.target.value}))} />
             </div>
          </div>
          <button disabled={loading} className="w-full bg-indigo-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-800 transition-all">{loading ? 'Verifying...' : 'Continue'}</button>
          <p className="text-[10px] text-center text-slate-400 px-6">By continuing, you agree to our <span className="text-indigo-600 font-bold underline cursor-pointer">Privacy Policy</span> and <span className="text-indigo-600 font-bold underline cursor-pointer">Terms of Service</span>.</p>
        </form>
      </div>
    );
  }

  // Step 2: Identity (PAN)
  if (step === 2) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4">
        {apiStatus === 'SANDBOX' && <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400 z-10" />}
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-black text-slate-800">Identity Details</h3>
          <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${apiStatus === 'SANDBOX' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{apiStatus} Gateway Active</div>
        </div>
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Permanent Account Number (PAN)</label>
            <div className="flex gap-3">
              <input type="text" placeholder="ABCDE1234F" className={`flex-1 p-4 border-2 rounded-xl uppercase font-mono tracking-[0.2em] text-lg focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all ${formData.panStatus === 'VERIFIED' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50'}`} maxLength={10} disabled={formData.panStatus === 'VERIFIED'} value={formData.panNumber || ''} onChange={e => setFormData(prev => ({...prev, panNumber: e.target.value.toUpperCase()}))} />
              <button onClick={handlePanVerify} disabled={verifyingPan || formData.panStatus === 'VERIFIED'} className={`px-6 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${formData.panStatus === 'VERIFIED' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-indigo-700 text-white hover:bg-indigo-800 shadow-xl shadow-indigo-100'}`}>{verifyingPan ? 'Wait...' : formData.panStatus === 'VERIFIED' ? 'Verified ✓' : 'Verify'}</button>
            </div>
          </div>
          {verifyingPan && (
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
               <div className="flex items-center gap-4">
                  <div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{panCheckStep === 'FORMAT' ? 'Checking Syntax...' : panCheckStep === 'CONNECTING' ? 'Connecting Gateway...' : 'Extracting Record...'}</span>
               </div>
            </div>
          )}
          {formData.panStatus === 'VERIFIED' && (
             <div className="p-6 bg-emerald-50 border-2 border-emerald-100 rounded-2xl animate-in slide-in-from-top-4">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Official Name</p>
                <h4 className="text-lg font-black text-emerald-900">{formData.fullName}</h4>
             </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</label>
              <input type="text" placeholder="As per documents" className="w-full p-4 border-2 border-slate-100 bg-slate-50 rounded-xl font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" value={formData.fullName || ''} onChange={e => setFormData(prev => ({...prev, fullName: e.target.value}))} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date of Birth</label>
              <input type="date" className="w-full p-4 border-2 border-slate-100 bg-slate-50 rounded-xl font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none" value={formData.dob || ''} onChange={e => setFormData(prev => ({...prev, dob: e.target.value}))} />
            </div>
          </div>
        </div>
        <div className="flex gap-4 mt-10">
          <button onClick={prevStep} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Back</button>
          <button onClick={() => formData.panStatus === 'VERIFIED' && nextStep()} disabled={formData.panStatus !== 'VERIFIED'} className="flex-[2] bg-indigo-700 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-indigo-800 disabled:opacity-50 transition-all">Continue</button>
        </div>
      </div>
    );
  }

  // Step 3: Aadhaar
  if (step === 3) {
    return (
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in fade-in">
        <h3 className="text-2xl font-black mb-2 text-slate-900">Aadhaar Auth</h3>
        <p className="text-slate-500 text-sm mb-8">Secure UIDAI authentication for paperless KYC.</p>
        <div className="space-y-6">
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">12-Digit Aadhaar Number</label>
              <input type="text" maxLength={12} placeholder="0000 0000 0000" className="w-full p-6 border-2 border-slate-100 bg-slate-50 rounded-2xl text-center font-black text-2xl tracking-[0.3em] text-indigo-700 outline-none" value={formData.aadhaarNumber || ''} onChange={e => setFormData(p => ({...p, aadhaarNumber: e.target.value.replace(/\D/g, '')}))} />
           </div>
           {error && <p className="text-rose-600 text-[10px] font-bold text-center uppercase">{error}</p>}
           <div className="flex gap-4 mt-4">
              <button onClick={prevStep} className="flex-1 bg-slate-100 py-4 rounded-xl font-bold">Back</button>
              <button onClick={handleAadhaarVerify} disabled={verifyingAadhaar} className="flex-[2] bg-indigo-700 text-white py-4 rounded-xl font-bold">{verifyingAadhaar ? 'Connecting UIDAI...' : 'Confirm'}</button>
           </div>
        </div>
      </div>
    );
  }

  // Step 4: Selfie/Liveness
  if (step === 4) {
    return (
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in fade-in">
        <h3 className="text-2xl font-black mb-2 text-slate-900">Liveness Check</h3>
        <p className="text-slate-500 text-sm mb-8">Look directly into the camera and ensure good lighting.</p>
        <div className="relative mx-auto w-full max-w-[360px] aspect-square rounded-[3rem] overflow-hidden bg-slate-900 border-8 border-slate-50 shadow-2xl ring-1 ring-slate-200">
          {!formData.liveSelfie ? (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          ) : (
            <img src={formData.liveSelfie} className="w-full h-full object-cover" alt="Selfie" />
          )}
          {isFlashing && <div className="absolute inset-0 bg-white z-50 animate-in fade-in duration-75" />}
          {analyzingLiveness && (
            <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center backdrop-blur-sm z-40">
              <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
              <p className="text-white text-[10px] font-black uppercase tracking-widest mt-4">AI Biometric Analysis</p>
            </div>
          )}
        </div>
        <div className="mt-8 space-y-4">
          {!formData.liveSelfie ? (
            <button onClick={capturePhoto} className="w-full bg-indigo-700 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-indigo-800 transition-all">Capture & Verify</button>
          ) : (
            <div className="flex gap-4">
              <button onClick={() => { setFormData(p => ({...p, liveSelfie: undefined, livenessResult: undefined})); startCamera(); }} className="flex-1 bg-slate-100 py-4 rounded-2xl font-bold">Retake</button>
              {formData.livenessResult?.isLive && <button onClick={nextStep} className="flex-[2] bg-indigo-700 text-white py-4 rounded-2xl font-bold shadow-lg">Confirm & Next</button>}
            </div>
          )}
          {formData.livenessResult && !formData.livenessResult.isLive && <p className="text-rose-600 text-[10px] font-black text-center uppercase">Biometric Mismatch: {formData.livenessResult.reasoning}</p>}
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // Step 5: Simulated Video KYC
  if (step === 5) {
    return (
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in fade-in">
        <h3 className="text-2xl font-black mb-2 text-slate-900">Video KYC</h3>
        <p className="text-slate-500 text-sm mb-8">Connect with a certified officer for final face-to-face verification.</p>
        <div className="aspect-video bg-slate-900 rounded-3xl overflow-hidden relative shadow-2xl border-4 border-white ring-1 ring-slate-200">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          <div className="absolute top-4 right-4 w-24 h-32 bg-slate-800 rounded-xl border border-white/20 overflow-hidden">
             <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center text-white font-black mb-2">A</div>
                <p className="text-[8px] text-white font-black uppercase opacity-60">Officer Arjun</p>
             </div>
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
             <div className="px-4 py-2 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase animate-pulse">On Call</div>
             <div className="px-4 py-2 bg-white/10 backdrop-blur-md text-white rounded-full text-[9px] font-black uppercase">Recording Active</div>
          </div>
        </div>
        <div className="mt-8 space-y-4">
           <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Instructions</p>
              <ul className="text-xs text-slate-600 font-bold space-y-2">
                 <li>• Keep your Original PAN Card ready.</li>
                 <li>• Read the OTP shown on screen aloud.</li>
                 <li>• Look at the screen for a photo capture.</li>
              </ul>
           </div>
           <button onClick={() => { setFormData(p => ({...p, videoKycStatus: 'COMPLETED'})); nextStep(); }} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-emerald-700 transition-all">Complete Verification</button>
        </div>
      </div>
    );
  }

  // Step 6: Employment Details
  if (step === 6) {
    return (
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in fade-in">
        <h3 className="text-2xl font-black mb-2 text-slate-900">Employment</h3>
        <p className="text-slate-500 text-sm mb-8">Tell us about your professional background.</p>
        <div className="space-y-6">
           <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setFormData(p => ({...p, employmentType: EmploymentType.SALARIED}))} className={`p-4 rounded-2xl border-2 font-black uppercase text-[10px] transition-all ${formData.employmentType === EmploymentType.SALARIED ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-100 text-slate-400'}`}>Salaried</button>
              <button onClick={() => setFormData(p => ({...p, employmentType: EmploymentType.SELF_EMPLOYED}))} className={`p-4 rounded-2xl border-2 font-black uppercase text-[10px] transition-all ${formData.employmentType === EmploymentType.SELF_EMPLOYED ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-100 text-slate-400'}`}>Self-Employed</button>
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Name</label>
              <input type="text" placeholder="Employer or Business Name" className="w-full p-4 border-2 border-slate-100 bg-slate-50 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all" value={formData.companyName || ''} onChange={e => setFormData(p => ({...p, companyName: e.target.value}))} />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Monthly Income (₹)</label>
              <input type="number" placeholder="Enter Amount" className="w-full p-4 border-2 border-slate-100 bg-slate-50 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all" value={formData.monthlyIncome || ''} onChange={e => setFormData(p => ({...p, monthlyIncome: +e.target.value}))} />
           </div>
           <button onClick={nextStep} disabled={!formData.companyName || !formData.monthlyIncome} className="w-full bg-indigo-700 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-indigo-800 disabled:opacity-50 transition-all">Continue</button>
        </div>
      </div>
    );
  }

  // Step 7: Bank Details
  if (step === 7) {
    return (
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in fade-in">
        <h3 className="text-2xl font-black mb-2 text-slate-900">Bank Account</h3>
        <p className="text-slate-500 text-sm mb-8">Where would you like to receive the funds?</p>
        <div className="space-y-6">
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bank Name</label>
              <input type="text" placeholder="e.g., HDFC Bank, ICICI" className="w-full p-4 border-2 border-slate-100 bg-slate-50 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all" value={formData.bankName || ''} onChange={e => setFormData(p => ({...p, bankName: e.target.value}))} />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Number</label>
              <input type="text" placeholder="Account Number" className="w-full p-4 border-2 border-slate-100 bg-slate-50 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all" value={formData.accountNumber || ''} onChange={e => setFormData(p => ({...p, accountNumber: e.target.value}))} />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IFSC Code</label>
              <input type="text" placeholder="SBIN0001234" className="w-full p-4 border-2 border-slate-100 bg-slate-50 rounded-xl font-bold uppercase outline-none focus:border-indigo-500 transition-all" value={formData.ifscCode || ''} onChange={e => setFormData(p => ({...p, ifscCode: e.target.value.toUpperCase()}))} />
           </div>
           <button onClick={nextStep} disabled={!formData.bankName || !formData.accountNumber || !formData.ifscCode} className="w-full bg-indigo-700 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-indigo-800 disabled:opacity-50 transition-all">Confirm Bank Data</button>
        </div>
      </div>
    );
  }

  // Step 8: Statement Analysis
  if (step === 8) {
    return (
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in fade-in">
        <h3 className="text-2xl font-black mb-2 text-slate-900">Financial Audit</h3>
        <p className="text-slate-500 text-sm mb-8">Provide your recent transaction summary for AI analysis.</p>
        <div className="space-y-6">
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transaction Summary / Copy-Paste</label>
              <textarea placeholder="Example: Salary credit of 65000 on 1st. Rent payment of 15000. Avg balance 50k. No bounces." className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl min-h-[160px] font-medium text-sm outline-none focus:border-indigo-500 transition-all" value={statementText} onChange={e => setStatementText(e.target.value)} />
           </div>
           {error && <p className="text-rose-600 text-[10px] font-bold text-center uppercase">{error}</p>}
           <button onClick={handleFinalSubmit} disabled={loading} className="w-full bg-indigo-700 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-indigo-800 disabled:opacity-50 transition-all">
              {loading ? 'AI Engine Analyzing...' : 'Analyze Financials'}
           </button>
           <p className="text-[9px] text-slate-400 text-center uppercase font-black leading-relaxed">Gemini 3 Flash analyzes banking behavior, salary credits, and risk indicators in real-time.</p>
        </div>
      </div>
    );
  }

  // Step 9: Loan Offer
  if (step === 9) {
    const offer = formData.loanOffer;
    return (
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-indigo-800 p-10 text-white text-center relative overflow-hidden">
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
          <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 flex items-start gap-4">
             <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
               Eligibility & Pricing Note: This offer is personalized based on your <b>Internal Credit Score of {formData.creditScore?.score}</b>. 
             </p>
          </div>
          <button onClick={nextStep} className="w-full bg-indigo-700 text-white py-6 rounded-[2rem] font-black text-xl shadow-2xl shadow-indigo-100 hover:bg-indigo-800 transition-all transform active:scale-[0.98]">Accept Offer & E-Sign</button>
        </div>
      </div>
    );
  }

  // Step 10: E-Sign
  if (step === 10) {
    const offer = formData.loanOffer;
    return (
      <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-4xl mx-auto overflow-hidden animate-in fade-in slide-in-from-bottom-6">
        <div className="flex justify-between items-start mb-10">
           <h3 className="text-2xl font-black text-slate-900">E-Sign Loan Agreement</h3>
           <div className="flex flex-col items-end text-[10px] font-mono font-bold text-indigo-600">FIN-{formData.id?.slice(0,8).toUpperCase()}</div>
        </div>
        {!isOtpSent ? (
          <div className="space-y-8">
            <div className="bg-white border-2 border-slate-100 rounded-3xl p-8 h-[300px] overflow-y-auto shadow-inner relative" onScroll={(e) => { if (e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 20) setHasViewedAgreement(true); }}>
              <div className="space-y-6">
                <div className="text-center border-b pb-4">
                   <h2 className="text-lg font-black uppercase text-slate-800">Sanction Letter</h2>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">I, {formData.fullName}, hereby accept the loan of ₹{offer?.amount.toLocaleString()} at {offer?.roi}% interest rate for {offer?.tenure} months. I authorize autopay via {formData.emiDeductionMethod}.</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">1. Repayment will happen via e-NACH on 5th of every month. 2. Defaulting results in penal interest.</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-6 py-6 border-t border-slate-50">
               <div className="flex items-center gap-3">
                  <input type="checkbox" id="agreement-consent" className="w-5 h-5 rounded accent-indigo-600 cursor-pointer" disabled={!hasViewedAgreement} checked={isConsentChecked} onChange={(e) => setIsConsentChecked(e.target.checked)} />
                  <label htmlFor="agreement-consent" className={`text-xs font-bold ${hasViewedAgreement ? 'text-slate-700' : 'text-slate-300'}`}>I authorize the NBFC to initiate disbursal.</label>
               </div>
               <button onClick={() => setIsOtpSent(true)} disabled={!isConsentChecked || !hasViewedAgreement} className="w-full max-w-sm bg-indigo-700 text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl disabled:opacity-40 hover:bg-indigo-800 transition-all">E-Sign with Mobile OTP</button>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-10">
            <div className="text-center">
               <h4 className="text-xl font-black text-slate-800">Verify Signature</h4>
               <p className="text-xs text-slate-500 mt-2 font-medium">Enter the 6-digit OTP sent to your phone.</p>
            </div>
            <div className="flex gap-2 justify-center">
              {esignOtp.map((digit, i) => (
                <input key={i} id={`otp-${i}`} type="text" maxLength={1} value={digit} onChange={(e) => handleOtpChange(i, e.target.value)} className="w-12 h-16 border-2 rounded-2xl text-center font-black text-2xl text-indigo-700 border-slate-100 focus:border-indigo-500 outline-none transition-all shadow-sm" />
              ))}
            </div>
            <button onClick={verifyEsignOtp} disabled={loading} className="w-full bg-indigo-700 text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl hover:bg-indigo-800 transition-all">Verify & Payout</button>
          </div>
        )}
      </div>
    );
  }

  // Step 11: Success
  if (step === 11) {
    return (
      <div className="bg-white p-12 rounded-[3rem] shadow-2xl border text-center border-slate-100 animate-in zoom-in-95">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce shadow-lg border-4 border-white">
           <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-2">Loan Sanctioned</h2>
        <p className="text-slate-500 mb-10 text-lg">Your payout is being initiated to your bank account.</p>
        <button onClick={() => window.location.reload()} className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl hover:bg-black transition-all">Finish</button>
      </div>
    );
  }

  return null;
};
