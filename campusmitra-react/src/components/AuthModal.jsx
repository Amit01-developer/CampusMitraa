import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { API } from '../utils/api';

// ── Password strength helper ──────────────────────────────────────────────────
function getPasswordStrength(pwd) {
  if (!pwd) return null;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { label: 'Weak', color: '#ef4444', width: '25%' };
  if (score === 2) return { label: 'Fair', color: '#f59e0b', width: '50%' };
  if (score === 3) return { label: 'Good', color: '#3b82f6', width: '75%' };
  return { label: 'Strong', color: '#10b981', width: '100%' };
}

// ── Password input with show/hide toggle ─────────────────────────────────────
function PasswordInput({ value, onChange, placeholder = '••••••••', id }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required
        style={{ paddingRight: 42 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--gray)', fontSize: '0.9rem', padding: 0, lineHeight: 1,
        }}
      >
        <i className={`fas ${show ? 'fa-eye-slash' : 'fa-eye'}`}></i>
      </button>
    </div>
  );
}

export default function AuthModal({ mode, onClose, onSwitchMode }) {
  const { login } = useAuth();
  const showToast = useToast();
  const [tab, setTab] = useState(mode);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrors, setLoginErrors] = useState({});

  // Signup fields
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupDept, setSignupDept] = useState('');
  const [signupErrors, setSignupErrors] = useState({});

  const [loading, setLoading] = useState(false);

  // ── Real-time validation ────────────────────────────────────────────────────
  function validateLoginField(field, value) {
    const errs = { ...loginErrors };
    if (field === 'email') {
      errs.email = value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'Enter a valid email' : '';
    }
    if (field === 'password') {
      errs.password = value && value.length < 6 ? 'Password must be at least 6 characters' : '';
    }
    setLoginErrors(errs);
  }

  function validateSignupField(field, value) {
    const errs = { ...signupErrors };
    if (field === 'name') {
      errs.name = value && value.trim().length < 2 ? 'Name must be at least 2 characters' : '';
    }
    if (field === 'email') {
      errs.email = value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'Enter a valid email' : '';
    }
    if (field === 'password') {
      errs.password = value && value.length < 6 ? 'Password must be at least 6 characters' : '';
    }
    setSignupErrors(errs);
  }

  const pwdStrength = getPasswordStrength(signupPassword);

  async function doLogin(e) {
    e.preventDefault();
    // Final validation before submit
    const errs = {};
    if (!loginEmail) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) errs.email = 'Enter a valid email';
    if (!loginPassword) errs.password = 'Password is required';
    if (Object.keys(errs).length) { setLoginErrors(errs); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); return; }
      login(data.token, data.user);
      showToast(`Welcome back, ${data.user.name}!`, 'success');
      onClose();
    } catch {
      showToast('Login failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function doSignup(e) {
    e.preventDefault();
    // Final validation before submit
    const errs = {};
    if (!signupName || signupName.trim().length < 2) errs.name = 'Name must be at least 2 characters';
    if (!signupEmail) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail)) errs.email = 'Enter a valid email';
    if (!signupPassword || signupPassword.length < 6) errs.password = 'Password must be at least 6 characters';
    if (Object.keys(errs).length) { setSignupErrors(errs); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signupName,
          email: signupEmail,
          password: signupPassword,
          department: signupDept,
        }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); return; }
      login(data.token, data.user);
      showToast(`Welcome to CampusMitra, ${data.user.name}!`, 'success');
      onClose();
    } catch {
      showToast('Signup failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function doGoogle() {
    try {
      const { signInWithGoogle } = await import('../utils/firebaseAuth.js');
      await signInWithGoogle(
        (data) => {
          login(data.token, data.user);
          showToast(`Welcome, ${data.user.name}!`, 'success');
          onClose();
        },
        (msg) => showToast(msg, 'error')
      );
    } catch {
      showToast('Google sign-in unavailable', 'error');
    }
  }

  // Inline error style helper
  const errStyle = { color: '#ef4444', fontSize: '0.78rem', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 };

  return (
    <div
      className="modal-overlay"
      style={{ display: 'flex' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box">
        <button className="modal-close" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>

        <div className="modal-tabs">
          <button
            className={`modal-tab${tab === 'login' ? ' active' : ''}`}
            onClick={() => setTab('login')}
          >
            Log In
          </button>
          <button
            className={`modal-tab${tab === 'signup' ? ' active' : ''}`}
            onClick={() => setTab('signup')}
          >
            Sign Up
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={doLogin} noValidate>
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                placeholder="your@campus.edu"
                value={loginEmail}
                onChange={(e) => { setLoginEmail(e.target.value); validateLoginField('email', e.target.value); }}
                style={loginErrors.email ? { borderColor: '#ef4444' } : {}}
              />
              {loginErrors.email && (
                <div style={errStyle}><i className="fas fa-exclamation-circle"></i> {loginErrors.email}</div>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <PasswordInput
                id="login-password"
                value={loginPassword}
                onChange={(e) => { setLoginPassword(e.target.value); validateLoginField('password', e.target.value); }}
              />
              {loginErrors.password && (
                <div style={errStyle}><i className="fas fa-exclamation-circle"></i> {loginErrors.password}</div>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 10 }}
              disabled={loading}
            >
              {loading ? <><i className="fas fa-spinner fa-spin"></i> Logging in…</> : 'Log In'}
            </button>
            <div className="google-divider"><span>or</span></div>
            <button type="button" className="btn-google" onClick={doGoogle}>
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                width="20"
                height="20"
                alt="Google"
              />
              Continue with Google
            </button>
          </form>
        ) : (
          <form onSubmit={doSignup} noValidate>
            <div className="form-group">
              <label htmlFor="signup-name">Full Name</label>
              <input
                id="signup-name"
                type="text"
                placeholder="Your name"
                value={signupName}
                onChange={(e) => { setSignupName(e.target.value); validateSignupField('name', e.target.value); }}
                style={signupErrors.name ? { borderColor: '#ef4444' } : {}}
              />
              {signupErrors.name && (
                <div style={errStyle}><i className="fas fa-exclamation-circle"></i> {signupErrors.name}</div>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="signup-email">Campus Email</label>
              <input
                id="signup-email"
                type="email"
                placeholder="your@campus.edu"
                value={signupEmail}
                onChange={(e) => { setSignupEmail(e.target.value); validateSignupField('email', e.target.value); }}
                style={signupErrors.email ? { borderColor: '#ef4444' } : {}}
              />
              {signupErrors.email && (
                <div style={errStyle}><i className="fas fa-exclamation-circle"></i> {signupErrors.email}</div>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="signup-password">Password</label>
              <PasswordInput
                id="signup-password"
                value={signupPassword}
                onChange={(e) => { setSignupPassword(e.target.value); validateSignupField('password', e.target.value); }}
              />
              {signupErrors.password && (
                <div style={errStyle}><i className="fas fa-exclamation-circle"></i> {signupErrors.password}</div>
              )}
              {/* Password strength bar */}
              {signupPassword && pwdStrength && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: pwdStrength.width,
                      background: pwdStrength.color,
                      transition: 'width 0.3s ease, background 0.3s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: pwdStrength.color, marginTop: 4, fontWeight: 600 }}>
                    {pwdStrength.label} password
                  </div>
                </div>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="signup-dept">Department</label>
              <input
                id="signup-dept"
                type="text"
                placeholder="e.g. Computer Science"
                value={signupDept}
                onChange={(e) => setSignupDept(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 10 }}
              disabled={loading}
            >
              {loading ? <><i className="fas fa-spinner fa-spin"></i> Creating account…</> : 'Create Account'}
            </button>
            <div className="google-divider"><span>or</span></div>
            <button type="button" className="btn-google" onClick={doGoogle}>
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                width="20"
                height="20"
                alt="Google"
              />
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
