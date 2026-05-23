import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import Chatbot from './components/Chatbot';

import Home from './pages/Home';
import OwnerDashboard from './pages/OwnerDashboard';
import BorrowerDashboard from './pages/BorrowerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Payment from './pages/Payment';
import ProfilePage from './pages/ProfilePage';
import MessagesPage from './pages/MessagesPage';

// ── Global CSS (same files as original frontend) ──────────────────────────────
import './styles/style.css';
import './styles/dashboard.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/"              element={<Home />} />
            <Route path="/owner"         element={<OwnerDashboard />} />
            <Route path="/borrower"      element={<BorrowerDashboard />} />
            <Route path="/admin"         element={<AdminDashboard />} />
            <Route path="/payment"       element={<Payment />} />
            <Route path="/profile"       element={<ProfilePage />} />
            <Route path="/profile/:userId" element={<ProfilePage />} />
            <Route path="/messages"      element={<MessagesPage />} />
            {/* Catch-all → Home */}
            <Route path="*"              element={<Home />} />
          </Routes>
          <Chatbot />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
