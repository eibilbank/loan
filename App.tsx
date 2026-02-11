
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { LoanApplication, AuditLog } from './types';

// Dynamic imports for optimized chunking
const MultiStepLoanForm = lazy(() => import('./components/MultiStepLoanForm').then(m => ({ default: m.MultiStepLoanForm })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 animate-pulse">
    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <div className="space-y-2 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Initializing Secure Module</p>
      <div className="h-2 w-32 bg-slate-100 rounded-full mx-auto"></div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    const savedApps = localStorage.getItem('finrisk_apps');
    if (savedApps) setApplications(JSON.parse(savedApps));
    
    const savedLogs = localStorage.getItem('finrisk_audit_logs');
    if (savedLogs) setAuditLogs(JSON.parse(savedLogs));
  }, []);

  const handleApplicationSubmit = (newApp: LoanApplication) => {
    const updated = [...applications, newApp];
    setApplications(updated);
    localStorage.setItem('finrisk_apps', JSON.stringify(updated));
  };

  const updateApplication = (updatedApp: LoanApplication) => {
    const updated = applications.map(a => a.id === updatedApp.id ? updatedApp : a);
    setApplications(updated);
    localStorage.setItem('finrisk_apps', JSON.stringify(updated));
  };

  const addAuditLog = (log: AuditLog) => {
    const updated = [log, ...auditLogs];
    setAuditLogs(updated);
    localStorage.setItem('finrisk_audit_logs', JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-indigo-700 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-white text-indigo-700 p-1 rounded font-bold text-xl">FP</div>
            <h1 className="text-xl font-bold tracking-tight">FinRisk Pro</h1>
          </div>
          <div className="flex gap-4 items-center">
            <span className="text-sm bg-indigo-600 px-3 py-1 rounded-full text-indigo-100">NBFC Internal Portal</span>
            <button 
              onClick={() => setIsAdmin(!isAdmin)}
              className="text-sm font-black uppercase tracking-widest hover:text-indigo-200 transition-colors bg-white/10 px-4 py-2 rounded-xl border border-white/20"
            >
              {isAdmin ? 'Switch to Applicant' : 'Switch to Admin'}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <Suspense fallback={<LoadingFallback />}>
          {isAdmin ? (
            <AdminDashboard 
              applications={applications} 
              auditLogs={auditLogs}
              onUpdate={updateApplication} 
              onAddAuditLog={addAuditLog}
            />
          ) : (
            <div className="max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Apply for a Business Loan</h2>
                <p className="text-slate-600">Quick, transparent, and digital application process in minutes.</p>
              </div>
              
              <MultiStepLoanForm 
                onSubmit={handleApplicationSubmit} 
                onAddAuditLog={addAuditLog}
              />
              
              <div className="mt-12 p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm">
                <h3 className="font-black text-slate-800 mb-2 uppercase text-[10px] tracking-widest">Regulatory Disclaimer</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  The credit evaluation is based on our "Internal Credit Risk Score" which ranges from 300 to 900. 
                  This is NOT a CIBIL or TransUnion score. Loan disbursal is subject to internal audit and verification. 
                  RBI guidelines for digital lending are strictly followed.
                </p>
              </div>
            </div>
          )}
        </Suspense>
      </main>
    </div>
  );
};

export default App;
