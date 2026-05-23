import { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toggleTheme, isDark } from '../utils/theme';
import AuthModal from './AuthModal';
import NotificationBell from './NotificationBell';
import { API } from '../utils/api';

export default function Navbar({ activePage = '' }) {
  const { currentUser, logout, authHeaders } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [darkMode, setDarkMode] = useState(isDark());
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  // Keep dark toggle icon in sync
  useEffect(() => {
    function syncIcon() { setDarkMode(document.body.classList.contains('dark-mode')); }
    const observer = new MutationObserver(syncIcon);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Poll unread message count every 30s
  useEffect(() => {
    if (!currentUser) { setUnreadMsgs(0); return; }
    fetchUnreadCount();
    const id = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(id);
  }, [currentUser]);

  // Reset badge when user navigates to /messages
  useEffect(() => {
    if (location.pathname === '/messages') setUnreadMsgs(0);
  }, [location.pathname]);

  async function fetchUnreadCount() {
    try {
      const res  = await fetch(`${API}/messages/conversations`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        const total = data.reduce((sum, c) => sum + (c.unread_count || 0), 0);
        setUnreadMsgs(total);
      }
    } catch { /* silent */ }
  }

  function handleToggleTheme() {
    toggleTheme();
    setDarkMode(document.body.classList.contains('dark-mode'));
  }

  function openAuth(mode) {
    setAuthMode(mode);
    setShowAuth(true);
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  function scrollTo(id) {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <>
      <header>
        <div className="container">
          <div className="header-content">
            <Link to="/" className="logo" style={{ textDecoration: 'none' }}>
              <i className="fas fa-handshake"></i>
              <span>CampusMitra</span>
            </Link>

            <nav aria-label="Primary navigation">
              <ul>
                {isHome ? (
                  <>
                    <li><a href="#home" onClick={(e) => { e.preventDefault(); scrollTo('home'); }}>Home</a></li>
                    <li><a href="#items" onClick={(e) => { e.preventDefault(); scrollTo('items'); }}>Browse</a></li>
                    <li><a href="#categories" onClick={(e) => { e.preventDefault(); scrollTo('categories'); }}>Categories</a></li>
                    <li><a href="#how" onClick={(e) => { e.preventDefault(); scrollTo('how'); }}>How It Works</a></li>
                  </>
                ) : (
                  <>
                    <li><NavLink to="/" end className={({ isActive }) => isActive ? 'nav-active' : ''}>Home</NavLink></li>
                    <li><NavLink to="/owner" className={({ isActive }) => isActive ? 'nav-active' : ''}>Owner</NavLink></li>
                    <li><NavLink to="/borrower" className={({ isActive }) => isActive ? 'nav-active' : ''}>Borrower</NavLink></li>
                  </>
                )}
              </ul>
            </nav>

            <div className="auth-buttons">
              <button
                className="dark-toggle"
                id="darkToggle"
                onClick={handleToggleTheme}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <i className={`fas ${darkMode ? 'fa-sun' : 'fa-moon'}`}></i>
              </button>

              {currentUser ? (
                <>
                  {/* Notification Bell */}
                  <NotificationBell />

                  {/* Messages — with unread dot */}
                  <Link
                    to="/messages"
                    title={unreadMsgs > 0 ? `${unreadMsgs} unread message${unreadMsgs > 1 ? 's' : ''}` : 'Messages'}
                    style={{ position: 'relative', color: 'var(--text)', fontSize: '1.1rem', padding: '6px 8px', borderRadius: 8, textDecoration: 'none', transition: 'background 0.2s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <i className="fas fa-comment-dots"></i>
                    {unreadMsgs > 0 && (
                      <span style={{
                        position: 'absolute', top: 2, right: 2,
                        background: '#ef4444', color: '#fff',
                        borderRadius: '50%', width: 17, height: 17,
                        fontSize: '0.62rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid var(--header-bg, #fff)',
                        lineHeight: 1,
                      }}>
                        {unreadMsgs > 9 ? '9+' : unreadMsgs}
                      </span>
                    )}
                  </Link>

                  {/* Dashboard dropdown */}
                  <div className="dash-dropdown" style={{ position: 'relative' }}>
                    <button
                      className="btn btn-outline dash-dropdown-btn"
                      onClick={() => setDropdownOpen((o) => !o)}
                    >
                      <i className="fas fa-th-large"></i> Dashboard{' '}
                      <i className="fas fa-chevron-down" style={{ fontSize: '0.7rem' }}></i>
                    </button>
                    {dropdownOpen && (
                      <div
                        className="dash-dropdown-menu"
                        style={{ display: 'block' }}
                        onClick={() => setDropdownOpen(false)}
                      >
                        <Link to="/owner" role="menuitem">
                          <i className="fas fa-box-open"></i> Owner Dashboard
                        </Link>
                        <Link to="/borrower" role="menuitem">
                          <i className="fas fa-search"></i> Borrower Dashboard
                        </Link>
                        <Link to="/messages" role="menuitem">
                          <i className="fas fa-comments"></i> Messages
                        </Link>
                        <Link to="/profile" role="menuitem">
                          <i className="fas fa-user-circle"></i> My Profile
                        </Link>
                      </div>
                    )}
                  </div>
                  {/* Profile avatar link */}
                  <Link to="/profile" title="My Profile"
                    style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#0d9488)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', flexShrink: 0 }}>
                    {currentUser.name?.[0]?.toUpperCase() || '?'}
                  </Link>
                  <button className="btn btn-outline" onClick={handleLogout}>
                    <i className="fas fa-sign-out-alt"></i> Log Out
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-outline" onClick={() => openAuth('login')}>
                    Log In
                  </button>
                  <button className="btn btn-primary" onClick={() => openAuth('signup')}>
                    Sign Up Free
                  </button>
                </>
              )}
            </div>

            {/* Hamburger */}
            <button
              className={`hamburger${mobileOpen ? ' open' : ''}`}
              aria-label="Toggle menu"
              onClick={() => setMobileOpen((o) => !o)}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className={`mobile-nav${mobileOpen ? ' open' : ''}`}>
          <ul>
            {isHome ? (
              <>
                <li><a href="#home" onClick={(e) => { e.preventDefault(); scrollTo('home'); }}>Home</a></li>
                <li><a href="#items" onClick={(e) => { e.preventDefault(); scrollTo('items'); }}>Browse</a></li>
                <li><a href="#categories" onClick={(e) => { e.preventDefault(); scrollTo('categories'); }}>Categories</a></li>
                <li><a href="#how" onClick={(e) => { e.preventDefault(); scrollTo('how'); }}>How It Works</a></li>
              </>
            ) : (
              <>
                <li><NavLink to="/" end className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={() => setMobileOpen(false)}>Home</NavLink></li>
                <li><NavLink to="/owner" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={() => setMobileOpen(false)}>Owner</NavLink></li>
                <li><NavLink to="/borrower" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={() => setMobileOpen(false)}>Borrower</NavLink></li>
              </>
            )}
            {currentUser && (
              <>
                <li id="mobileOwnerLink"><Link to="/owner" onClick={() => setMobileOpen(false)}><i className="fas fa-box-open"></i> Owner Dashboard</Link></li>
                <li id="mobileBorrowerLink"><Link to="/borrower" onClick={() => setMobileOpen(false)}><i className="fas fa-search"></i> Borrower Dashboard</Link></li>
                <li><Link to="/messages" onClick={() => setMobileOpen(false)}><i className="fas fa-comments"></i> Messages</Link></li>
                <li><Link to="/profile" onClick={() => setMobileOpen(false)}><i className="fas fa-user-circle"></i> My Profile</Link></li>
              </>
            )}
          </ul>

          {/* Auth buttons in mobile nav */}
          <div className="mobile-nav-auth">
            <button
              className="dark-toggle"
              onClick={() => { handleToggleTheme(); }}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ width: '100%', borderRadius: 10, height: 40 }}
            >
              <i className={`fas ${darkMode ? 'fa-sun' : 'fa-moon'}`}></i>
              &nbsp; {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
            {currentUser ? (
              <button className="btn btn-outline" onClick={() => { handleLogout(); setMobileOpen(false); }}>
                <i className="fas fa-sign-out-alt"></i> Log Out ({currentUser.name?.split(' ')[0]})
              </button>
            ) : (
              <>
                <button className="btn btn-outline" onClick={() => { openAuth('login'); setMobileOpen(false); }}>
                  <i className="fas fa-sign-in-alt"></i> Log In
                </button>
                <button className="btn btn-primary" onClick={() => { openAuth('signup'); setMobileOpen(false); }}>
                  <i className="fas fa-user-plus"></i> Sign Up Free
                </button>
              </>
            )}
          </div>
        </nav>
      </header>

      {showAuth && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuth(false)}
          onSwitchMode={setAuthMode}
        />
      )}
    </>
  );
}
