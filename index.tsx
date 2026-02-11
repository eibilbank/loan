
import React, { useState, useEffect, Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { LoanApplication, AuditLog } from './types';

const MultiStepLoanForm = lazy(() => import('./components/MultiStepLoanForm').then(m => ({ default: m.MultiStepLoanForm })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 animate-pulse">
    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <div className="space-y-2 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Syncing with PHP Backend</p>
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

  const handleApplicationSubmit = async (newApp: LoanApplication) => {
    try {
      const response = await fetch('api.php?action=submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application: newApp })
      });
      const result = await response.json();
      if (result.success) {
        const updated = [...applications, result.application];
        setApplications(updated);
        localStorage.setItem('finrisk_apps', JSON.stringify(updated));
      }
    } catch (e) {
      console.error("PHP Backend Error", e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-indigo-700 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-white text-indigo-700 p-1 rounded font-bold text-xl">FP</div>
            <h1 className="text-xl font-bold tracking-tight">FinRisk Pro <span className="text-[10px] bg-indigo-500 px-2 py-1 rounded">PHP v1.0</span></h1>
          </div>
          <button onClick={() => setIsAdmin(!isAdmin)} className="text-sm font-black uppercase tracking-widest bg-white/10 px-4 py-2 rounded-xl border border-white/20">
            {isAdmin ? 'Applicant View' : 'NBFC Admin'}
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <Suspense fallback={<LoadingFallback />}>
          {isAdmin ? (
            <AdminDashboard applications={applications} auditLogs={auditLogs} onUpdate={() => {}} onAddAuditLog={() => {}} />
          ) : (
            <div className="max-w-3xl mx-auto">
              <MultiStepLoanForm onSubmit={handleApplicationSubmit} onAddAuditLog={() => {}} />
            </div>
          )}
        </Suspense>
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
