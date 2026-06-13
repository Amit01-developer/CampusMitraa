import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import Chatbot from './components/Chatbot';

// ── Lazy-loaded pages (each page gets its own JS chunk) ───────────────────────
const Home             = lazy(() => import('./pages/Home'));
const OwnerDashboard   = lazy(() => import('./pages/OwnerDashboard'));
const BorrowerDashboard = lazy(() => import('./pages/BorrowerDashboard'));
const AdminDashboard   = lazy(() => import('./pages/AdminDashboard'));
const Payment          = lazy(() => import('./pages/Payment'));
const ProfilePage      = lazy(() => import('./pages/ProfilePage'));
const MessagesPage     = lazy(() => import('./pages/MessagesPage'));

// ── Global CSS ────────────────────────────────────────────────────────────────
import './styles/style.css';
import './styles/dashboard.css';

// ── Page loading fallback ─────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', flexDirection: 'column', gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, border: '3px solid #e0e7ff',
        borderTopColor: '#4f46e5', borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>Loading…</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/"                element={<Home />} />
              <Route path="/owner"           element={<OwnerDashboard />} />
              <Route path="/borrower"        element={<BorrowerDashboard />} />
              <Route path="/admin"           element={<AdminDashboard />} />
              <Route path="/payment"         element={<Payment />} />
              <Route path="/profile"         element={<ProfilePage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
              <Route path="/messages"        element={<MessagesPage />} />
              {/* Catch-all → Home */}
              <Route path="*"                element={<Home />} />
            </Routes>
          </Suspense>
          <Chatbot />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
