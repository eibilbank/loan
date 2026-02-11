
import React, { useState, useMemo } from 'react';
import { LoanApplication, RiskCategory, AuditLog, VideoKycStatus, InternalCreditScore, BankStatementAnalysis, RiskFlag } from '../types';

interface Props {
  applications: LoanApplication[];
  auditLogs: AuditLog[];
  onUpdate: (app: LoanApplication) => void;
  onAddAuditLog: (log: AuditLog) => void;
}

const SIMULATED_ADMIN_ID = "NBFC_INTERNAL_AUDITOR_V4";

export const AdminDashboard: React.FC<Props> = ({ applications, auditLogs, onUpdate, onAddAuditLog }) => {
  const [selectedApp, setSelectedApp] = useState<LoanApplication | null>(null);
  const [view, setView] = useState<'QUEUE' | 'AUDIT'>('QUEUE');
  const [actionReason, setActionReason] = useState('');

  const handleAction = (app: LoanApplication, status: 'APPROVED' | 'REJECTED') => {
    if (!actionReason.trim()) {
      alert("MANDATORY ACTION: Please provide a detailed justification for this decision.");
      return;
    }

    const auditEntry: AuditLog = {
      id: crypto.randomUUID(),
      entityId: app.id,
      action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
      actor: SIMULATED_ADMIN_ID,
      details: `${status} action performed. Decision Justification: ${actionReason.trim()}`,
      timestamp: new Date().toISOString()
    };
    
    onUpdate({ ...app, status });
    onAddAuditLog(auditEntry);
    setSelectedApp(null);
    setActionReason('');
  };

  const updateVkycStatus = (app: LoanApplication, status: VideoKycStatus) => {
    const actionLog: AuditLog = {
      id: crypto.randomUUID(),
      entityId: app.id,
      action: status === 'COMPLETED' ? 'VKYC_COMPLETED' : 'VKYC_FAILED',
      actor: SIMULATED_ADMIN_ID,
      details: `V-KYC interaction result updated to ${status}.`,
      timestamp: new Date().toISOString()
    };
    const updatedApp = { ...app, videoKycStatus: status };
    onUpdate(updatedApp);
    setSelectedApp(updatedApp);
    onAddAuditLog(actionLog);
  };

  const renderProgress = (label: string, value: number, max: number, color: string) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span>{label}</span>
          <span className="text-slate-600">{value} pts</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${percentage}%` }}></div>
        </div>
      </div>
    );
  };

  const PolicyBadge = ({ passed, label }: { passed: boolean; label: string }) => (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${passed ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${passed ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
      {label}
      <span className="ml-auto">{passed ? '✓' : '✕'}</span>
    </div>
  );

  // Dynamic Decision Engine Logic
  const getSystemRecommendation = (app: LoanApplication) => {
    const score = app.creditScore?.score || 300;
    const confidence = Math.round(((score - 300) / 600) * 100);
    const flags = app.creditScore?.riskFlags || [];
    const analysis = app.statementAnalysis;

    let verdict = "MANUAL REVIEW";
    let colorClass = "text-amber-400";
    let bgClass = "bg-amber-500/10 border-amber-500/50";

    if (score >= 750 && flags.length === 0) {
      verdict = "CONFIDENT APPROVE";
      colorClass = "text-emerald-400";
      bgClass = "bg-emerald-500/10 border-emerald-500/50";
    } else if (score >= 650) {
      verdict = "CONDITIONAL APPROVE";
      colorClass = "text-indigo-400";
      bgClass = "bg-indigo-500/10 border-indigo-500/50";
    } else if (score < 550 || flags.some(f => f.severity === 'HIGH')) {
      verdict = "REJECT RECOMMENDATION";
      colorClass = "text-rose-400";
      bgClass = "bg-rose-500/10 border-rose-500/50";
    }

    const reasons = [];
    if (analysis) {
      if (analysis.bounces === 0) reasons.push("clean repayment history (0 bounces)");
      if (analysis.incomeStabilityScore > 80) reasons.push("high income stability");
      if (app.monthlyIncome > 50000) reasons.push("strong debt service coverage");
    }
    if (app.livenessResult?.isLive) reasons.push("verified biometric liveness");
    if (flags.length > 0) reasons.push(`notable risk factors: ${flags.map(f => f.code).join(', ')}`);

    const summary = `System suggests ${verdict} with ${confidence}% confidence. Decision is supported by ${reasons.slice(0, 3).join(', ')} and an internal risk score of ${score}.`;

    return { verdict, confidence, summary, colorClass, bgClass };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-4 border-b border-slate-200">
          <button onClick={() => setView('QUEUE')} className={`pb-4 text-sm font-bold transition-all px-2 ${view === 'QUEUE' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>Underwriting Queue</button>
          <button onClick={() => setView('AUDIT')} className={`pb-4 text-sm font-bold transition-all px-2 ${view === 'AUDIT' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>Internal Audit Logs</button>
        </div>
        <div className="flex gap-2">
           <div className="bg-white px-4 py-2 rounded-xl border flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-400 uppercase">System Status</span>
              <span className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-bold">
                 <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                 DECISION ENGINE LIVE
              </span>
           </div>
        </div>
      </div>

      {view === 'QUEUE' ? (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl shadow-slate-200/50">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
              <tr>
                <th className="px-8 py-5">Entity / Applicant</th>
                <th className="px-8 py-5">Internal Score</th>
                <th className="px-8 py-5">Risk Grade</th>
                <th className="px-8 py-5">Biometric Trust</th>
                <th className="px-8 py-5">Digital KYC</th>
                <th className="px-8 py-5 text-right">Portfolio Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.length === 0 && (
                <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-400 italic font-medium">Underwriting queue is currently clear. Standing by for new applications.</td></tr>
              )}
              {applications.map(app => (
                <tr key={app.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                       <span className="font-black text-slate-900 text-sm">{app.fullName}</span>
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Ref: {app.id.slice(0,8).toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center font-black text-indigo-700 border border-indigo-100/50 shadow-inner">
                          {app.creditScore?.score || '---'}
                       </div>
                       <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${((app.creditScore?.score || 300)-300)/600*100}%` }}></div>
                       </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      app.creditScore?.category === RiskCategory.LOW ? 'bg-emerald-100 text-emerald-700' :
                      app.creditScore?.category === RiskCategory.MEDIUM ? 'bg-blue-100 text-blue-700' :
                      app.creditScore?.category === RiskCategory.HIGH ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {app.creditScore?.category || 'PENDING'}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                     <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${app.livenessResult?.isLive ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`}></div>
                        <span className="text-xs font-bold text-slate-600">{app.livenessResult?.confidenceScore || 0}% Match</span>
                     </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black border uppercase ${
                      app.videoKycStatus === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                      app.videoKycStatus === 'IN_QUEUE' ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}>
                      {app.videoKycStatus}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button onClick={() => setSelectedApp(app)} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-slate-200">
                      Audit Portfolio
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl">
           <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
              <tr>
                <th className="px-8 py-5">Audit Timestamp</th>
                <th className="px-8 py-5">Decision Actor</th>
                <th className="px-8 py-5">Action Trace</th>
                <th className="px-8 py-5">System Justification / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {auditLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/30">
                  <td className="px-8 py-6 text-[10px] font-mono text-slate-500 uppercase">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                       <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center font-black text-indigo-700 text-[10px]">ID</div>
                       <span className="text-xs font-bold text-slate-700">{log.actor}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      log.action === 'APPROVE' ? 'bg-emerald-100 text-emerald-700' :
                      log.action === 'REJECT' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-xs text-slate-500 leading-relaxed max-w-sm">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1">Entity: {log.entityId}</span>
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
           </table>
        </div>
      )}

      {selectedApp && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl z-[100] flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-[1200px] rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-300 border border-white flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-8 border-b flex items-center justify-between bg-slate-50/50 rounded-t-[3rem]">
               <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-700 text-white flex items-center justify-center text-2xl font-black shadow-xl shadow-indigo-200">
                    {selectedApp.fullName[0]}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 leading-tight">{selectedApp.fullName}</h2>
                    <div className="flex gap-4 mt-1">
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Application ID: {selectedApp.id.slice(0,12)}</span>
                       <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Submission: {new Date(selectedApp.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
               </div>
               <button onClick={() => setSelectedApp(null)} className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 grid grid-cols-12 gap-10 bg-white">
              
              {/* Left Column: Metrics & Indicators */}
              <div className="col-span-12 lg:col-span-4 space-y-10">
                 
                 {/* Factor Breakdown */}
                 <section className="space-y-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <span className="w-8 h-px bg-slate-200"></span>
                      Decision Vectors
                    </h4>
                    <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 shadow-inner space-y-5">
                       {selectedApp.creditScore && (
                         <>
                           {renderProgress('Bank Behavior', selectedApp.creditScore.factors.bankBehavior, 250, 'bg-indigo-600')}
                           {renderProgress('Income & Job', selectedApp.creditScore.factors.incomeEmployment, 150, 'bg-indigo-400')}
                           {renderProgress('Repayment Discipline', selectedApp.creditScore.factors.discipline, 100, 'bg-emerald-500')}
                           {renderProgress('Stability Index', selectedApp.creditScore.factors.stability, 50, 'bg-sky-500')}
                           {renderProgress('KYC Integrity', selectedApp.creditScore.factors.kyc, 100, 'bg-amber-400')}
                         </>
                       )}
                    </div>
                 </section>

                 {/* Portfolio Metrics */}
                 <section className="space-y-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <span className="w-8 h-px bg-slate-200"></span>
                      Profitability Metrics
                    </h4>
                    <div className="bg-emerald-900 p-8 rounded-[2.5rem] text-white shadow-xl shadow-emerald-900/10">
                       <div className="space-y-4">
                          <div className="flex justify-between items-center">
                             <span className="text-[10px] font-bold uppercase opacity-60">Est. Yield</span>
                             <span className="text-lg font-black">{selectedApp.loanOffer?.roi}% PA</span>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className="text-[10px] font-bold uppercase opacity-60">LTV Ratio</span>
                             <span className="text-lg font-black">42.5%</span>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className="text-[10px] font-bold uppercase opacity-60">NIM Contribution</span>
                             <span className="text-lg font-black">₹{Math.round((selectedApp.loanOffer?.amount || 0) * 0.04)}</span>
                          </div>
                       </div>
                    </div>
                 </section>

                 {/* Identity Proofs */}
                 <section className="space-y-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <span className="w-8 h-px bg-slate-200"></span>
                      Identity Artifacts
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="aspect-square bg-slate-900 rounded-3xl border-2 border-slate-50 shadow-lg overflow-hidden relative group">
                          {selectedApp.liveSelfie ? <img src={selectedApp.liveSelfie} className="w-full h-full object-cover" alt="KYC Selfie" /> : <div className="flex items-center justify-center h-full text-[10px] text-slate-500 font-bold uppercase">No Selfie</div>}
                          <div className="absolute inset-x-0 bottom-0 p-3 bg-black/60 backdrop-blur-sm text-white text-[9px] font-black uppercase text-center">Biometric Scan</div>
                       </div>
                       <div className="aspect-square bg-slate-100 rounded-3xl border-2 border-slate-50 shadow-lg flex flex-col items-center justify-center p-4 text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">V-KYC Linkage</p>
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${selectedApp.videoKycStatus === 'COMPLETED' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                             {selectedApp.videoKycStatus}
                          </span>
                       </div>
                    </div>
                 </section>

              </div>

              {/* Right Column: Deep Analysis & Underwriting Decision */}
              <div className="col-span-12 lg:col-span-8 space-y-10">
                 
                 {/* Financial Health Summary (Gemini Powered) */}
                 <section className="space-y-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <span className="w-8 h-px bg-slate-200"></span>
                      AI Behavioral Insight
                    </h4>
                    <div className="bg-indigo-700 p-10 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-white/10 transition-colors"></div>
                       <p className="text-lg font-medium leading-relaxed italic opacity-90 relative">
                         "{selectedApp.statementAnalysis?.summary || "No behavioral summary generated by system."}"
                       </p>
                       <div className="mt-8 flex gap-6 border-t border-white/10 pt-8 relative">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Avg. Balance</p>
                            <p className="text-2xl font-black">₹{selectedApp.statementAnalysis?.avgMonthlyBalance.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Salary Credits</p>
                            <p className="text-2xl font-black">₹{selectedApp.statementAnalysis?.salaryCredits.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Health Score</p>
                            <p className="text-2xl font-black">{selectedApp.statementAnalysis?.incomeStabilityScore}/100</p>
                          </div>
                       </div>
                    </div>
                 </section>

                 {/* Decisions Recommendation */}
                 <section className="space-y-6">
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <span className="w-8 h-px bg-indigo-200"></span>
                      System Decision Recommendation
                    </h4>
                    {(() => {
                      const rec = getSystemRecommendation(selectedApp);
                      return (
                        <div className={`p-8 rounded-[2.5rem] border flex items-start gap-8 transition-all duration-500 ${rec.bgClass}`}>
                           <div className={`w-20 h-20 rounded-full flex items-center justify-center shrink-0 border-2 ${rec.bgClass} shadow-lg`}>
                              <span className={`text-2xl font-black ${rec.colorClass}`}>{rec.confidence}%</span>
                           </div>
                           <div className="flex-1">
                              <p className={`text-xs font-black uppercase tracking-widest mb-1 ${rec.colorClass}`}>Recommendation: {rec.verdict}</p>
                              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                                 {rec.summary}
                              </p>
                           </div>
                        </div>
                      );
                    })()}
                 </section>

                 {/* System Policy Engine */}
                 <section className="space-y-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <span className="w-8 h-px bg-slate-200"></span>
                      NBFC Policy Clearance Checklist
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                       <PolicyBadge passed={selectedApp.panStatus === 'VERIFIED'} label="PAN Validated" />
                       <PolicyBadge passed={selectedApp.aadhaarVerified} label="UIDAI Auth" />
                       <PolicyBadge passed={(selectedApp.statementAnalysis?.bounces || 0) === 0} label="0-Bounce Policy" />
                       <PolicyBadge passed={(selectedApp.statementAnalysis?.negativeBalanceDays || 0) < 5} label="Liquidity Buffer" />
                       <PolicyBadge passed={selectedApp.videoKycStatus === 'COMPLETED'} label="Face-to-Face KYC" />
                       <PolicyBadge passed={(selectedApp.livenessResult?.confidenceScore || 0) > 85} label="AI Liveness 85+" />
                       <PolicyBadge passed={selectedApp.monthlyIncome > 20000} label="Min Income 20k" />
                       <PolicyBadge passed={selectedApp.employmentType === 'SALARIED'} label="Employment Type" />
                    </div>
                 </section>

                 {/* Red Flags / Risk Alert */}
                 {selectedApp.creditScore?.riskFlags && selectedApp.creditScore.riskFlags.length > 0 && (
                   <section className="space-y-6">
                      <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-[0.3em] flex items-center gap-3">
                        <span className="w-8 h-px bg-rose-200"></span>
                        High Risk Alerts
                      </h4>
                      <div className="space-y-3">
                         {selectedApp.creditScore.riskFlags.map((flag, idx) => (
                           <div key={idx} className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex items-center gap-6 group hover:bg-rose-100/50 transition-colors">
                              <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-black shadow-lg shadow-rose-200 group-hover:scale-110 transition-transform">!</div>
                              <div>
                                 <p className="text-[10px] font-black text-rose-800 uppercase tracking-widest">{flag.code}</p>
                                 <p className="text-xs text-rose-600 font-bold mt-1">{flag.description}</p>
                              </div>
                              <span className="ml-auto px-3 py-1 bg-rose-600 text-white text-[9px] font-black uppercase rounded-full">{flag.severity}</span>
                           </div>
                         ))}
                      </div>
                   </section>
                 )}

                 {/* Underwriting Controls */}
                 <div className="pt-10 border-t-2 border-slate-50 space-y-8 bg-slate-50/30 p-10 rounded-[3rem]">
                    <div className="flex items-center justify-between mb-4">
                       <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Final Underwriting Verdict</h3>
                       <div className="flex gap-2">
                          <button onClick={() => updateVkycStatus(selectedApp, 'COMPLETED')} className="bg-white border text-[10px] font-black px-4 py-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors">Force Pass V-KYC</button>
                          <button onClick={() => updateVkycStatus(selectedApp, 'FAILED')} className="bg-white border text-[10px] font-black px-4 py-2 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors">Fail V-KYC</button>
                       </div>
                    </div>
                    
                    <textarea 
                      className="w-full p-8 bg-white border border-slate-200 rounded-[2rem] min-h-[160px] text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm"
                      placeholder="Input comprehensive internal justification for current decision (RBI Audit Mandatory)..."
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                    />
                    
                    <div className="flex gap-4">
                       <button 
                         disabled={!actionReason.trim() || selectedApp.videoKycStatus !== 'COMPLETED'}
                         onClick={() => handleAction(selectedApp, 'APPROVED')}
                         className="flex-[2] bg-indigo-700 text-white py-6 rounded-[2rem] text-lg font-black shadow-2xl shadow-indigo-100 hover:bg-indigo-800 disabled:opacity-40 disabled:grayscale transition-all transform active:scale-[0.98] flex items-center justify-center gap-3"
                       >
                         Approve for Payout
                       </button>
                       <button 
                         disabled={!actionReason.trim()}
                         onClick={() => handleAction(selectedApp, 'REJECTED')}
                         className="flex-1 bg-white text-rose-600 border-2 border-rose-100 py-6 rounded-[2rem] text-lg font-black hover:bg-rose-50 disabled:opacity-40 transition-all active:scale-[0.98]"
                       >
                         Reject
                       </button>
                    </div>

                    {selectedApp.videoKycStatus !== 'COMPLETED' && (
                      <div className="flex items-center gap-4 p-5 bg-amber-50 border border-amber-100 rounded-2xl animate-in slide-in-from-top-2">
                         <span className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center font-black animate-pulse">!</span>
                         <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest leading-relaxed">
                            Compliance Lock: RBI digital lending guidelines require 'Face-to-Face' Video KYC completion before sanctioning funds.
                         </p>
                      </div>
                    )}
                 </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
