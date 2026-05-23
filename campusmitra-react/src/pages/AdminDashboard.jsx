import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { API } from '../utils/api';
import { toggleTheme } from '../utils/theme';
import { useScrollRestore } from '../utils/useScrollRestore';

const ADMIN_EMAIL = 'hacktolearn001@gmail.com';

function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function AdminDashboard() {
  const showToast = useToast();
  const navigate = useNavigate();
  useScrollRestore();

  const [adminToken, setAdminToken] = useState(localStorage.getItem('cs_token'));
  const [adminUser, setAdminUser] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Data
  const [stats, setStats] = useState({});
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [allRentals, setAllRentals] = useState([]);
  const [rentalFilter, setRentalFilter] = useState('all');
  const [allItems, setAllItems] = useState([]);

  function authHeaders() {
    return { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
  }

  // ── Boot: verify existing token ───────────────────────────────────────────
  useEffect(() => {
    if (!adminToken) return;
    fetch(`${API}/auth/me`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((user) => {
        if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
          localStorage.removeItem('cs_token');
          setAdminToken(null);
          setLoginError('Access denied. Admin only.');
          return;
        }
        setAdminUser(user);
        setLoggedIn(true);
        loadStats();
      })
      .catch(() => { localStorage.removeItem('cs_token'); setAdminToken(null); });
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    if (loginEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      setLoginError('Access denied. Admin only.'); return;
    }
    setLoginLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || 'Invalid credentials.'); return; }
      if (data.user?.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        setLoginError('Access denied. Admin only.'); return;
      }
      const token = data.token || data.access_token;
      localStorage.setItem('cs_token', token);
      setAdminToken(token);
      setAdminUser(data.user);
      setLoggedIn(true);
      loadStats();
    } catch { setLoginError('Login failed. Try again.'); }
    finally { setLoginLoading(false); }
  }

  function adminLogout() {
    localStorage.removeItem('cs_token');
    setAdminToken(null);
    setAdminUser(null);
    setLoggedIn(false);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  async function loadStats() {
    try {
      const res = await fetch(`${API}/admin/stats`, { headers: authHeaders() });
      if (res.status === 403) { showToast('Admin access required', 'error'); return; }
      setStats(await res.json());
    } catch { showToast('Could not load stats', 'error'); }
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  async function loadUsers() {
    try {
      const res = await fetch(`${API}/admin/users`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      setAllUsers(await res.json());
    } catch { showToast('Could not load users', 'error'); }
  }

  async function setUserApproval(userId, isApproved) {
    try {
      const res = await fetch(`${API}/admin/users/${userId}/approve`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ is_approved: isApproved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      showToast(`User ${isApproved ? 'approved' : 'suspended'} successfully`, 'success');
      setAllUsers((prev) => prev.map((u) => String(u.id) === String(userId) ? { ...u, is_approved: isApproved } : u));
    } catch (err) { showToast(err.message || 'Could not update user', 'error'); }
  }

  // ── Rentals ───────────────────────────────────────────────────────────────
  async function loadRentals() {
    try {
      const res = await fetch(`${API}/admin/rentals`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      setAllRentals(await res.json());
    } catch { showToast('Could not load rentals', 'error'); }
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  async function loadItems() {
    try {
      const res = await fetch(`${API}/admin/items`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      setAllItems(await res.json());
    } catch { showToast('Could not load items', 'error'); }
  }

  function switchTab(tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
    if (tab === 'users') loadUsers();
    if (tab === 'rentals') loadRentals();
    if (tab === 'items') loadItems();
  }

  // ── Filtered data ─────────────────────────────────────────────────────────
  const filteredUsers = userSearch
    ? allUsers.filter((u) => (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.email || '').toLowerCase().includes(userSearch.toLowerCase()))
    : allUsers;

  const filteredRentals = rentalFilter === 'all' ? allRentals : allRentals.filter((r) => r.status === rentalFilter);

  // ── LOGIN GATE ────────────────────────────────────────────────────────────
  if (!loggedIn) {
    return (
      <div className="admin-login-wrap">
        <div className="admin-login-card">
          <div className="admin-login-logo">
            <i className="fas fa-handshake"></i>
            <span>CampusMitra</span>
          </div>
          <div className="admin-login-subtitle">Admin Portal — Restricted Access</div>
          {loginError && <div className="login-error show">{loginError}</div>}
          <form onSubmit={handleLogin}>
            <label htmlFor="adminEmail">Email</label>
            <input type="email" id="adminEmail" placeholder="admin@example.com" required
              value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
            <label htmlFor="adminPassword">Password</label>
            <input type="password" id="adminPassword" placeholder="••••••••" required
              value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
            <button type="submit" className="btn-admin-login" disabled={loginLoading}>
              {loginLoading
                ? <><i className="fas fa-spinner fa-spin"></i> Signing in…</>
                : <><i className="fas fa-shield-alt"></i> Sign In as Admin</>
              }
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  return (
    <div id="adminDashboard">
      {/* Navbar */}
      <header>
        <div className="container">
          <div className="header-content">
            <a href="/" className="logo" onClick={(e) => { e.preventDefault(); navigate('/'); }} style={{ textDecoration: 'none' }}>
              <i className="fas fa-handshake"></i><span>CampusMitra</span>
            </a>
            <nav><ul>
              <li><a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>Home</a></li>
              <li><a href="/owner" onClick={(e) => { e.preventDefault(); navigate('/owner'); }}>Owner</a></li>
              <li><a href="/borrower" onClick={(e) => { e.preventDefault(); navigate('/borrower'); }}>Borrower</a></li>
            </ul></nav>
            <div className="auth-buttons">
              <button className="dark-toggle" onClick={toggleTheme} title="Toggle theme"><i className="fas fa-moon"></i></button>
              <span className="admin-badge"><i className="fas fa-shield-alt"></i> Admin</span>
              <span className="dash-user-name">{adminUser?.name?.split(' ')[0]}</span>
              <button className="btn btn-outline" onClick={adminLogout}>Log Out</button>
            </div>
            <button className={`hamburger${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen((o) => !o)}>
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </header>

      <div className="dash-layout">
        {/* Sidebar */}
        <aside className={`dash-sidebar admin-sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sidebar-profile">
            <div className="avatar" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
              {adminUser?.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div>
              <div className="sidebar-name" style={{ color: '#f1f5f9' }}>{adminUser?.name || 'Admin'}</div>
              <div className="sidebar-role">Super Admin</div>
            </div>
          </div>
          <nav className="sidebar-nav">
            {[
              { tab: 'overview', icon: 'fa-chart-pie', label: 'Overview' },
              { tab: 'users', icon: 'fa-users', label: 'Users' },
              { tab: 'rentals', icon: 'fa-handshake', label: 'Deals / Rentals' },
              { tab: 'items', icon: 'fa-box-open', label: 'Items' },
            ].map(({ tab, icon, label }) => (
              <a key={tab} href="#"
                className={`sidebar-link${activeTab === tab ? ' active' : ''}`}
                onClick={(e) => { e.preventDefault(); switchTab(tab); }}>
                <i className={`fas ${icon}`}></i> {label}
              </a>
            ))}
          </nav>
          <div className="sidebar-logout-wrap">
            <button className="btn-sidebar-logout" onClick={adminLogout}>
              <i className="fas fa-sign-out-alt"></i> Logout
            </button>
          </div>
        </aside>

        <main className="dash-main">
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="tab-content active">
              <div className="admin-header-gradient">
                <div>
                  <h1>Admin Overview 🛡️</h1>
                  <p>Platform-wide statistics and health metrics.</p>
                </div>
                <span className="admin-badge"><i className="fas fa-shield-alt"></i> Admin</span>
              </div>
              <div className="admin-stats-grid">
                {[
                  { icon: 'fa-users', num: stats.total_users, label: 'Total Users', cls: 'asc-indigo' },
                  { icon: 'fa-box-open', num: stats.total_items, label: 'Total Items', cls: 'asc-teal' },
                  { icon: 'fa-receipt', num: stats.total_rentals, label: 'Total Rentals', cls: 'asc-purple' },
                  { icon: 'fa-clock', num: stats.pending_rentals, label: 'Pending Rentals', cls: 'asc-amber' },
                  { icon: 'fa-check-circle', num: stats.active_rentals, label: 'Active Rentals', cls: 'asc-green' },
                  { icon: 'fa-rupee-sign', num: stats.total_revenue != null ? '₹' + Number(stats.total_revenue).toLocaleString('en-IN') : '—', label: 'Total Revenue (₹)', cls: 'asc-rose' },
                  { icon: 'fa-user-check', num: stats.pending_approvals, label: 'Pending Approvals', cls: 'asc-slate' },
                ].map((c) => (
                  <div key={c.label} className={`admin-stat-card ${c.cls}`}>
                    <i className={`fas ${c.icon}`}></i>
                    <div>
                      <div className="admin-stat-num">{c.num ?? '—'}</div>
                      <div className="admin-stat-label">{c.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* USERS */}
          {activeTab === 'users' && (
            <div className="tab-content active">
              <div className="dash-header">
                <div><h1>Users</h1><p>Manage all registered renters and owners.</p></div>
              </div>
              <div className="admin-search-bar">
                <i className="fas fa-search"></i>
                <input type="text" placeholder="Search by name or email…"
                  value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Email</th><th>Dept / Year</th><th>Trust</th>
                      <th>Items</th><th>Rentals (B/L)</th><th>Status</th><th>Joined</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>
                        {allUsers.length === 0 ? <><i className="fas fa-spinner fa-spin"></i> Loading…</> : 'No users found.'}
                      </td></tr>
                    ) : filteredUsers.map((u) => {
                      const dept = [u.department, u.year ? `Y${u.year}` : ''].filter(Boolean).join(' · ') || '—';
                      const joined = u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '—';
                      return (
                        <tr key={u.id}>
                          <td><strong>{escHtml(u.name || '—')}</strong></td>
                          <td style={{ color: 'var(--gray)' }}>{escHtml(u.email || '—')}</td>
                          <td>{escHtml(dept)}</td>
                          <td>{u.trust_score ?? '—'}</td>
                          <td>{u.items_listed ?? 0}</td>
                          <td>{(u.rentals_as_borrower ?? 0)} / {(u.rentals_as_lender ?? 0)}</td>
                          <td>
                            {u.is_approved
                              ? <span className="badge-active">Active</span>
                              : <span className="badge-suspended">Suspended</span>
                            }
                          </td>
                          <td style={{ color: 'var(--gray)' }}>{joined}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn-approve" disabled={u.is_approved}
                                style={u.is_approved ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                                onClick={() => setUserApproval(u.id, true)}>
                                <i className="fas fa-check"></i> Approve
                              </button>
                              <button className="btn-suspend" disabled={!u.is_approved}
                                style={!u.is_approved ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                                onClick={() => setUserApproval(u.id, false)}>
                                <i className="fas fa-ban"></i> Suspend
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* RENTALS */}
          {activeTab === 'rentals' && (
            <div className="tab-content active">
              <div className="dash-header">
                <div><h1>Deals &amp; Rentals</h1><p>All rental transactions across the platform.</p></div>
              </div>
              <div className="rentals-filter-bar">
                {['all', 'pending', 'active', 'returned', 'cancelled'].map((s) => (
                  <button key={s} className={`rentals-filter-btn${rentalFilter === s ? ' active' : ''}`}
                    onClick={() => setRentalFilter(s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              {filteredRentals.length === 0 ? (
                <div className="empty-state">
                  {allRentals.length === 0 ? <><i className="fas fa-spinner fa-spin"></i><p>Loading rentals…</p></> : <><i className="fas fa-receipt"></i><p>No rentals found.</p></>}
                </div>
              ) : filteredRentals.map((r) => {
                const bookingId = 'CM-' + String(r.id).substring(0, 8).toUpperCase();
                const statusCls = { pending: 'sbadge-pending', active: 'sbadge-active', returned: 'sbadge-returned', cancelled: 'sbadge-cancelled' }[r.status] || 'sbadge-pending';
                const typeBadge = r.rental_type === 'borrow'
                  ? <span style={{ background: 'rgba(13,148,136,0.12)', color: '#0d9488', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>Borrow</span>
                  : <span style={{ background: 'rgba(79,70,229,0.12)', color: '#4f46e5', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>Rent</span>;
                return (
                  <div key={r.id} className="admin-rental-card">
                    <div className="admin-rental-info" style={{ flex: 1, minWidth: 260 }}>
                      <h4>
                        <span className="rental-id-chip">{bookingId}</span>
                        &nbsp;{escHtml(r.item_name || 'Item')}&nbsp;{typeBadge}
                      </h4>
                      <p><i className="fas fa-user"></i> <strong>Borrower:</strong> {r.borrower ? `${escHtml(r.borrower.name)} (${escHtml(r.borrower.email)})` : '—'}</p>
                      <p><i className="fas fa-store"></i> <strong>Owner:</strong> {r.lender ? `${escHtml(r.lender.name)} (${escHtml(r.lender.email)})` : '—'}</p>
                      <p><i className="fas fa-calendar-alt"></i> {r.start_date ? new Date(r.start_date).toLocaleDateString('en-IN') : '—'} → {r.end_date ? new Date(r.end_date).toLocaleDateString('en-IN') : '—'}</p>
                      <p><i className="fas fa-rupee-sign"></i> {r.total_price ? '₹' + Number(r.total_price).toLocaleString('en-IN') : 'Free'}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                      <span className={statusCls}>{r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '—'}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{r.created_at ? r.created_at.split('T')[0] : ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ITEMS */}
          {activeTab === 'items' && (
            <div className="tab-content active">
              <div className="dash-header">
                <div><h1>All Items</h1><p>Every item listed on the platform.</p></div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr><th>Name</th><th>Category</th><th>Price</th><th>Condition</th><th>Owner</th><th>Status</th><th>Listed On</th></tr>
                  </thead>
                  <tbody>
                    {allItems.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)' }}>
                        <i className="fas fa-spinner fa-spin"></i> Loading items…
                      </td></tr>
                    ) : allItems.map((item) => {
                      const catLabels = { electronics: 'Electronics', textbooks: 'Textbooks', tools: 'Tools', clothing: 'Clothing' };
                      const listed = item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '—';
                      return (
                        <tr key={item.id}>
                          <td><strong>{escHtml(item.name || '—')}</strong></td>
                          <td>{escHtml(catLabels[item.category_slug] || item.category_slug || '—')}</td>
                          <td>{escHtml(item.price || (item.price_amount ? `₹${item.price_amount}` : '—'))}</td>
                          <td>{escHtml(item.condition || '—')}</td>
                          <td>{item.owner ? escHtml(item.owner.name) : '—'}</td>
                          <td>{item.is_available ? <span className="avail-chip">Available</span> : <span className="rented-chip">Rented</span>}</td>
                          <td style={{ color: 'var(--gray)' }}>{listed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
