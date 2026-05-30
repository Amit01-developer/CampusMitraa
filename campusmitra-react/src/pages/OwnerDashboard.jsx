import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { API } from '../utils/api';
import { catGradient, catIcon } from '../utils/helpers';
import { useScrollRestore } from '../utils/useScrollRestore';

export default function OwnerDashboard() {
  const { currentUser, authHeaders, logout } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  useScrollRestore();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Overview state
  const [overview, setOverview] = useState({ totalItems: 0, available: 0, rented: 0, pending: 0 });
  const [recentRequests, setRecentRequests] = useState([]);

  // Items state
  const [myItems, setMyItems] = useState([]);

  // Requests state
  const [allRequests, setAllRequests] = useState([]);

  // Add item form state
  const [form, setForm] = useState({
    name: '', category_slug: '', price_amount: '', price_unit: 'day',
    deposit_amount: '', condition: 'Good', description: '',
  });
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef();
  const cameraInputRef = useRef();

  useEffect(() => {
    if (!currentUser) { navigate('/'); return; }
    // Admin ko sirf admin dashboard dikhao
    if (currentUser.email?.toLowerCase() === 'hacktolearn001@gmail.com') {
      navigate('/admin'); return;
    }
    loadOverview();
  }, [currentUser]);

  // ── Overview ──────────────────────────────────────────────────────────────
  async function loadOverview() {
    try {
      const [itemsRes, rentalsRes] = await Promise.all([
        fetch(`${API}/items?available=false`, { headers: authHeaders() }),
        fetch(`${API}/rentals?role=lender`, { headers: authHeaders() }),
      ]);
      const allItems = await itemsRes.json();
      const rentals = await rentalsRes.json();
      const mine = Array.isArray(allItems) ? allItems.filter((i) => i.owner?.id === currentUser.id) : [];
      setOverview({
        totalItems: mine.length,
        available: mine.filter((i) => i.is_available).length,
        rented: mine.filter((i) => !i.is_available).length,
        pending: rentals.filter((r) => r.status === 'pending').length,
      });
      setRecentRequests(rentals.slice(0, 5));
    } catch { showToast('Could not load overview', 'error'); }
  }

  // ── My Items ──────────────────────────────────────────────────────────────
  async function loadMyItems() {
    try {
      const res = await fetch(`${API}/items?available=false`, { headers: authHeaders() });
      const all = await res.json();
      setMyItems(Array.isArray(all) ? all.filter((i) => i.owner?.id === currentUser.id) : []);
    } catch { showToast('Could not load items', 'error'); }
  }

  async function toggleAvailability(itemId, currentlyAvailable) {
    await fetch(`${API}/items/${itemId}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ is_available: !currentlyAvailable }),
    });
    showToast('Item status updated', 'success');
    loadMyItems();
  }

  async function deleteItem(itemId) {
    if (!window.confirm('Delete this item?')) return;
    const res = await fetch(`${API}/items/${itemId}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) { showToast('Item deleted', 'success'); loadMyItems(); }
    else showToast('Could not delete item', 'error');
  }

  // ── Requests ──────────────────────────────────────────────────────────────
  async function loadRequests() {
    try {
      const res = await fetch(`${API}/rentals?role=lender`, { headers: authHeaders() });
      setAllRequests(await res.json());
    } catch { showToast('Could not load requests', 'error'); }
  }

  async function updateRentalStatus(rentalId, status) {
    const res = await fetch(`${API}/rentals/${rentalId}/status`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { showToast(data.error || 'Update failed', 'error'); return; }
    const label = { active: 'accepted', cancelled: 'rejected', returned: 'marked as returned' }[status] || status;
    showToast(`Rental ${label}`, 'success');
    loadRequests();
    loadOverview();
  }

  async function updateDepositStatus(rentalId, depositStatus) {
    const res = await fetch(`${API}/rentals/${rentalId}/deposit`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ deposit_status: depositStatus }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { showToast(data.error || 'Update failed', 'error'); return; }
    const labels = { refunded: 'Deposit marked as refunded ✅', forfeited: 'Deposit forfeited ⚠️', held: 'Deposit marked as held' };
    showToast(labels[depositStatus] || 'Deposit updated', depositStatus === 'forfeited' ? 'error' : 'success');
    loadRequests();
  }

  // ── Add Item ──────────────────────────────────────────────────────────────
  // Category-wise suggested deposit ranges (in ₹)
  const DEPOSIT_SUGGESTIONS = {
    electronics: { min: 1000, max: 5000, label: 'Electronics (₹1,000–₹5,000 suggested)' },
    textbooks:   { min: 100,  max: 500,  label: 'Textbooks (₹100–₹500 suggested)' },
    tools:       { min: 500,  max: 3000, label: 'Tools & Equipment (₹500–₹3,000 suggested)' },
    clothing:    { min: 200,  max: 1000, label: 'Clothing (₹200–₹1,000 suggested)' },
  };

  function handleCategoryChange(slug) {
    const suggestion = DEPOSIT_SUGGESTIONS[slug];
    setForm((prev) => ({
      ...prev,
      category_slug: slug,
      // Auto-suggest deposit only if user hasn't typed one yet
      deposit_amount: prev.deposit_amount ? prev.deposit_amount : (suggestion ? String(suggestion.min) : ''),
    }));
  }
  function handleImgChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB', 'error'); return; }
    setImgFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImgPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImgFile(null);
    setImgPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  async function submitNewItem() {
    const errors = {};
    if (!form.name || form.name.length < 1 || form.name.length > 60)
      errors.name = 'Title must be 1–60 characters';
    if (!form.category_slug) errors.category_slug = 'Please select a category';
    if (!form.price_amount || parseFloat(form.price_amount) <= 0)
      errors.price_amount = 'Enter a valid price greater than 0';
    if (form.description && (form.description.length < 20 || form.description.length > 600))
      errors.description = 'Description must be 20–600 characters';
    setFormErrors(errors);
    if (Object.keys(errors).length) { showToast('Please fix the errors above', 'error'); return; }

    let image_url = '';
    if (imgFile) {
      showToast('Processing image…', 'info');
      image_url = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(imgFile);
      });
    }

    const price_amount = parseFloat(form.price_amount);
    const deposit_amount = parseFloat(form.deposit_amount) || 0;
    const price = `₹${price_amount}/${form.price_unit}`;
    const deposit = deposit_amount ? `₹${deposit_amount.toLocaleString('en-IN')}` : null;

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/items`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          name: form.name, category_slug: form.category_slug,
          price, price_amount, price_unit: form.price_unit,
          condition: form.condition, description: form.description,
          deposit, deposit_amount, image_url,
        }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); return; }
      showToast(`✨ "${form.name}" is now live!`, 'success');
      setForm({ name: '', category_slug: '', price_amount: '', price_unit: 'day', deposit_amount: '', condition: 'Good', description: '' });
      removeImage();
      setFormErrors({});
      switchTab('my-items');
      loadMyItems();
    } catch { showToast('Failed to list item. Try again.', 'error'); }
    finally { setSubmitting(false); }
  }

  // ── Draft save/load ───────────────────────────────────────────────────────
  function saveDraft() {
    localStorage.setItem('cm_draft', JSON.stringify(form));
    showToast('Draft saved locally', 'info');
  }

  function loadDraft() {
    const draft = JSON.parse(localStorage.getItem('cm_draft') || 'null');
    if (!draft) return;
    setForm({
      name: draft.name || '',
      category_slug: draft.category_slug || draft.category || '',
      price_amount: draft.price_amount || draft.price || '',
      price_unit: draft.price_unit || draft.unit || 'day',
      deposit_amount: draft.deposit_amount || draft.deposit || '',
      condition: draft.condition || 'Good',
      description: draft.description || draft.desc || '',
    });
  }

  // ── Tab switch ────────────────────────────────────────────────────────────
  function switchTab(tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
    if (tab === 'my-items') loadMyItems();
    if (tab === 'requests') loadRequests();
    if (tab === 'add-item') setTimeout(loadDraft, 60);
  }

  // ── Render request card ───────────────────────────────────────────────────
  function RequestCard({ r, compact }) {
    const item = r.item || {};
    const rid = String(r.id);
    const [actionLoading, setActionLoading] = useState('');

    async function handleStatus(status) {
      setActionLoading(status);
      await updateRentalStatus(rid, status);
      setActionLoading('');
    }

    async function handleDeposit(depositStatus) {
      setActionLoading('deposit_' + depositStatus);
      await updateDepositStatus(rid, depositStatus);
      setActionLoading('');
    }

    const typeBadge = r.rental_type === 'borrow'
      ? <span style={{ background: 'rgba(13,148,136,0.12)', color: '#0d9488', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>Borrow</span>
      : <span style={{ background: 'rgba(79,70,229,0.12)', color: '#4f46e5', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>Rent</span>;

    const depositAmt = r.deposit_amount || 0;
    const depStatus  = r.deposit_status || 'none';
    const depBadge = depositAmt > 0 ? {
      held:      { bg: '#fef3c7', color: '#92400e', icon: 'fa-shield-alt',    text: `Deposit Held ₹${Number(depositAmt).toLocaleString('en-IN')}` },
      refunded:  { bg: '#dcfce7', color: '#166534', icon: 'fa-check-circle',  text: `Deposit Refunded ₹${Number(depositAmt).toLocaleString('en-IN')}` },
      forfeited: { bg: '#fee2e2', color: '#991b1b', icon: 'fa-exclamation-triangle', text: `Deposit Forfeited ₹${Number(depositAmt).toLocaleString('en-IN')}` },
    }[depStatus] : null;

    return (
      <div className="request-card">
        <div className="request-info">
          <h4>{item.name || 'Item'} &nbsp;{typeBadge}</h4>
          <p>
            <i className="fas fa-tag"></i> {item.price || '—'} &nbsp;|&nbsp;
            <i className="fas fa-calendar"></i>{' '}
            {r.start_date ? new Date(r.start_date).toLocaleDateString('en-IN') : '—'} →{' '}
            {r.end_date ? new Date(r.end_date).toLocaleDateString('en-IN') : '—'}
          </p>
          {depBadge && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: depBadge.bg, color: depBadge.color }}>
              <i className={`fas ${depBadge.icon}`}></i> {depBadge.text}
            </span>
          )}
        </div>
        <div className="request-actions">
          {r.borrower_id && (
            <button
              onClick={() => navigate(`/messages?to=${r.borrower_id}&rental_id=${rid}&item_name=${encodeURIComponent(item.name || '')}`)}
              style={{ background: 'rgba(13,148,136,0.1)', color: '#0d9488', border: '1px solid rgba(13,148,136,0.3)', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              title="Message Borrower"
            >
              <i className="fas fa-comment"></i> Message
            </button>
          )}
          {r.status === 'pending' ? (
            <>
              <button className="btn-accept" onClick={() => handleStatus('active')} disabled={!!actionLoading}>
                {actionLoading === 'active'
                  ? <><i className="fas fa-spinner fa-spin"></i> Accepting…</>
                  : <><i className="fas fa-check"></i> Accept</>}
              </button>
              <button className="btn-reject" onClick={() => handleStatus('cancelled')} disabled={!!actionLoading}>
                {actionLoading === 'cancelled'
                  ? <><i className="fas fa-spinner fa-spin"></i> Rejecting…</>
                  : <><i className="fas fa-times"></i> Reject</>}
              </button>
            </>
          ) : r.status === 'active' ? (
            <>
              <button className="btn-return" onClick={() => handleStatus('returned')} disabled={!!actionLoading}>
                {actionLoading === 'returned'
                  ? <><i className="fas fa-spinner fa-spin"></i> Updating…</>
                  : <><i className="fas fa-undo"></i> Mark Returned</>}
              </button>
              {depositAmt > 0 && depStatus === 'held' && (
                <button
                  onClick={() => { if (window.confirm('Deposit forfeit karna chahte ho? (damage claim)')) handleDeposit('forfeited'); }}
                  disabled={!!actionLoading}
                  style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  {actionLoading === 'deposit_forfeited'
                    ? <><i className="fas fa-spinner fa-spin"></i> Processing…</>
                    : <><i className="fas fa-exclamation-triangle"></i> Forfeit Deposit</>}
                </button>
              )}
            </>
          ) : r.status === 'returned' && depositAmt > 0 && depStatus === 'held' ? (
            <button className="btn-accept" onClick={() => handleDeposit('refunded')} disabled={!!actionLoading}>
              {actionLoading === 'deposit_refunded'
                ? <><i className="fas fa-spinner fa-spin"></i> Processing…</>
                : <><i className="fas fa-check-circle"></i> Refund Deposit</>}
            </button>
          ) : (
            <span style={{ background: '#f3f4f6', color: '#374151', padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600 }}>
              {r.status}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  return (
    <>
      <Navbar />
      <div className="dash-layout">
        {/* Sidebar backdrop */}
        {sidebarOpen && (
          <div className="dash-sidebar-backdrop open" onClick={() => setSidebarOpen(false)} />
        )}
        {/* Sidebar */}
        <aside className={`dash-sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sidebar-profile">
            <div className="avatar">{currentUser.name?.[0]?.toUpperCase()}</div>
            <div>
              <div className="sidebar-name">{currentUser.name}</div>
              <div className="sidebar-role">Item Owner</div>
            </div>
            {/* Close button — mobile only */}
            <button
              className="sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
          <nav className="sidebar-nav">
            {[
              { tab: 'overview', icon: 'fa-chart-pie', label: 'Overview' },
              { tab: 'my-items', icon: 'fa-box-open', label: 'My Items' },
              { tab: 'add-item', icon: 'fa-plus-circle', label: 'Add New Item' },
              { tab: 'requests', icon: 'fa-bell', label: 'Rental Requests', badge: overview.pending },
            ].map(({ tab, icon, label, badge }) => (
              <a
                key={tab}
                href="#"
                className={`sidebar-link${activeTab === tab ? ' active' : ''}`}
                onClick={(e) => { e.preventDefault(); switchTab(tab); }}
              >
                <i className={`fas ${icon}`}></i> {label}
                {badge > 0 && <span className="badge">{badge}</span>}
              </a>
            ))}
            <a href="/messages" className="sidebar-link" onClick={(e) => { e.preventDefault(); navigate('/messages'); }}>
              <i className="fas fa-comments"></i> Messages
            </a>
            <a href="/profile" className="sidebar-link" onClick={(e) => { e.preventDefault(); navigate('/profile'); }}>
              <i className="fas fa-user-circle"></i> My Profile
            </a>
          </nav>
        </aside>

        <main className="dash-main">
          {/* Mobile sidebar toggle */}
          <button
            className="dash-mobile-menu-btn"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Open menu"
          >
            <i className="fas fa-bars"></i> Menu
          </button>

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="tab-content active">
              <div className="dash-header">
                <h1>Welcome back, {currentUser.name?.split(' ')[0]} 👋</h1>
                <p>Here's a summary of your listings and earnings.</p>
              </div>
              <div className="overview-cards">
                {[
                  { icon: 'fa-box-open', num: overview.totalItems, label: 'Total Listed Items', cls: 'indigo' },
                  { icon: 'fa-check-circle', num: overview.available, label: 'Available Now', cls: 'teal' },
                  { icon: 'fa-handshake', num: overview.rented, label: 'Currently Rented', cls: 'amber' },
                  { icon: 'fa-clock', num: overview.pending, label: 'Pending Requests', cls: 'purple' },
                ].map((c) => (
                  <div key={c.label} className={`ov-card ${c.cls}`}>
                    <i className={`fas ${c.icon}`}></i>
                    <div>
                      <div className="ov-num">{c.num}</div>
                      <div className="ov-label">{c.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="dash-section-title">Recent Rental Requests</div>
              {recentRequests.length === 0
                ? <div className="empty-state"><i className="fas fa-inbox"></i><p>No requests yet</p></div>
                : recentRequests.map((r) => <RequestCard key={r.id} r={r} compact />)
              }
            </div>
          )}

          {/* MY ITEMS */}
          {activeTab === 'my-items' && (
            <div className="tab-content active">
              <div className="dash-header">
                <h1>My Listed Items</h1>
                <button className="btn btn-primary" onClick={() => switchTab('add-item')}>
                  <i className="fas fa-plus"></i> Add Item
                </button>
              </div>
              {myItems.length === 0
                ? <div className="empty-state"><i className="fas fa-box-open"></i><p>No items listed yet.</p></div>
                : (
                  <div className="items-owner-grid">
                    {myItems.map((item) => (
                      <div key={item.id} className="owner-item-card">
                        <div className="owner-item-img" style={item.image_url ? {} : { background: catGradient(item.category_slug) }}>
                          {item.image_url
                            ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <i className={`fas ${catIcon(item.category_slug)}`}></i>
                          }
                        </div>
                        <div className="owner-item-body">
                          <h3>{item.name}</h3>
                          <div className="owner-item-meta">
                            <span className="owner-item-price">{item.price}</span>
                            <span className={`status-pill ${item.is_available ? 'status-available' : 'status-rented'}`}>
                              {item.is_available ? 'Available' : 'Rented'}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.85rem', color: 'var(--gray)', marginBottom: 12 }}>{item.description || ''}</p>
                          <div className="owner-item-actions">
                            <button className="btn-sm-teal" onClick={() => toggleAvailability(item.id, item.is_available)}>
                              <i className={`fas fa-${item.is_available ? 'pause' : 'play'}`}></i>{' '}
                              {item.is_available ? 'Mark Rented' : 'Mark Available'}
                            </button>
                            <button className="btn-danger" onClick={() => deleteItem(item.id)}>
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )}

          {/* ADD ITEM */}
          {activeTab === 'add-item' && (
            <div className="tab-content active">
              <div className="dash-header">
                <div>
                  <h1>List a New Item</h1>
                  <p>Fill in the details to make your item available for rent.</p>
                </div>
              </div>
              <div className="list-form-wrap">
                <div className="list-form-card">
                  {/* Basic Info */}
                  <div className="form-section-label"><i className="fas fa-tag"></i> Basic Info</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Item Name <span style={{ color: '#dc2626' }}>*</span></label>
                      <input type="text" placeholder="e.g. MacBook Air M1" maxLength={60}
                        value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={formErrors.name ? 'invalid' : ''} />
                      {formErrors.name && <div className="field-error visible"><i className="fas fa-exclamation-circle"></i> {formErrors.name}</div>}
                    </div>
                    <div className="form-group">
                      <label>Category <span style={{ color: '#dc2626' }}>*</span></label>
                      <select value={form.category_slug} onChange={(e) => handleCategoryChange(e.target.value)}
                        className={formErrors.category_slug ? 'invalid' : ''}>
                        <option value="">Select category</option>
                        <option value="electronics">Electronics</option>
                        <option value="textbooks">Textbooks &amp; Study</option>
                        <option value="tools">Tools &amp; Equipment</option>
                        <option value="clothing">Clothing &amp; Formal Wear</option>
                      </select>
                      {formErrors.category_slug && <div className="field-error visible"><i className="fas fa-exclamation-circle"></i> {formErrors.category_slug}</div>}
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="form-section-label"><i className="fas fa-rupee-sign"></i> Pricing</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Rental Price (₹) <span style={{ color: '#dc2626' }}>*</span></label>
                      <input type="number" placeholder="e.g. 500" min="1"
                        value={form.price_amount} onChange={(e) => setForm({ ...form, price_amount: e.target.value })}
                        className={formErrors.price_amount ? 'invalid' : ''} />
                      {formErrors.price_amount && <div className="field-error visible"><i className="fas fa-exclamation-circle"></i> {formErrors.price_amount}</div>}
                    </div>
                    <div className="form-group">
                      <label>Price Unit <span style={{ color: '#dc2626' }}>*</span></label>
                      <select value={form.price_unit} onChange={(e) => setForm({ ...form, price_unit: e.target.value })}>
                        <option value="day">Per Day</option>
                        <option value="week">Per Week</option>
                        <option value="month">Per Month</option>
                        <option value="event">Per Event</option>
                        <option value="subject">Per Subject</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>
                        Deposit Amount (₹){' '}
                        <span style={{ color: 'var(--gray)', fontWeight: 400 }}>optional</span>
                      </label>
                      <input type="number" placeholder="e.g. 2000" min="0"
                        value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })} />
                      {form.category_slug && DEPOSIT_SUGGESTIONS[form.category_slug] && (
                        <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <i className="fas fa-shield-alt"></i>
                          {DEPOSIT_SUGGESTIONS[form.category_slug].label}
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Condition</label>
                      <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                        <option value="New">New</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                      </select>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="form-section-label"><i className="fas fa-align-left"></i> Details</div>
                  <div className="form-group">
                    <label>Description <span style={{ color: 'var(--gray)', fontWeight: 400 }}>optional</span></label>
                    <textarea rows={3} maxLength={600} placeholder="Describe your item…"
                      value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      {formErrors.description && <div className="field-error visible"><i className="fas fa-exclamation-circle"></i> {formErrors.description}</div>}
                      <div className="char-counter">{form.description.length} / 600</div>
                    </div>
                  </div>

                  {/* Photo */}
                  <div className="form-section-label"><i className="fas fa-camera"></i> Photo</div>
                  <div className="form-group">
                    {imgPreview ? (
                      <>
                        <img src={imgPreview} className="img-preview" alt="Preview"
                          style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, marginBottom: 8 }} />
                        <button type="button" className="img-remove-btn" onClick={removeImage}>
                          <i className="fas fa-times"></i> Remove photo
                        </button>
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: 10 }}>
                        {/* Upload from gallery */}
                        <button type="button" className="img-upload-btn"
                          onClick={() => fileInputRef.current?.click()}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '18px 12px', border: '2px dashed var(--border)', borderRadius: 12, background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--gray)', fontSize: '0.85rem', transition: 'border-color 0.2s' }}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <i className="fas fa-image" style={{ fontSize: '1.6rem', color: 'var(--primary)' }}></i>
                          <span style={{ fontWeight: 600 }}>Gallery</span>
                          <small>JPG, PNG, WEBP — max 2MB</small>
                        </button>

                        {/* Capture from camera */}
                        <button type="button" className="img-upload-btn"
                          onClick={() => cameraInputRef.current?.click()}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '18px 12px', border: '2px dashed var(--border)', borderRadius: 12, background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--gray)', fontSize: '0.85rem', transition: 'border-color 0.2s' }}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0d9488'}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <i className="fas fa-camera" style={{ fontSize: '1.6rem', color: '#0d9488' }}></i>
                          <span style={{ fontWeight: 600 }}>Camera</span>
                          <small>Take a photo now</small>
                        </button>
                      </div>
                    )}

                    {/* Hidden file inputs */}
                    <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleImgChange} />
                    <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleImgChange} />
                  </div>

                  <div className="form-submit-row">
                    <button className="btn-submit-list" onClick={submitNewItem} disabled={submitting}>
                      {submitting ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-upload"></i> List Item</>}
                    </button>
                    <button className="btn-draft" type="button" onClick={saveDraft}>
                      <i className="fas fa-save"></i> Save Draft
                    </button>
                  </div>
                </div>

                {/* Live Preview */}
                <div className="list-preview-col">
                  <div className="list-preview-label"><i className="fas fa-eye"></i> &nbsp;Live Preview</div>
                  <div className="item-card-v2" style={{ pointerEvents: 'none' }}>
                    <div className="ic-img">
                      {imgPreview
                        ? <img src={imgPreview} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div className="ic-img-placeholder" style={{ background: catGradient(form.category_slug) }}>
                            <i className={`fas ${catIcon(form.category_slug)}`} style={{ fontSize: '3rem' }}></i>
                          </div>
                      }
                      <span className="ic-price-chip">
                        {form.price_amount ? `₹${form.price_amount}/${form.price_unit}` : '₹—'}
                      </span>
                    </div>
                    <div className="ic-body">
                      <div className="ic-title">{form.name || 'Your item title'}</div>
                      <div className="ic-chips">
                        <span className="ic-chip">{form.condition || 'Good'}</span>
                        <span className="ic-chip avail-today">Available</span>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: 10, textAlign: 'center' }}>
                    This is how your listing will appear to borrowers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* REQUESTS */}
          {activeTab === 'requests' && (
            <div className="tab-content active">
              <div className="dash-header">
                <h1>Rental Requests</h1>
                <p>Manage incoming requests from borrowers.</p>
              </div>
              {allRequests.length === 0
                ? <div className="empty-state"><i className="fas fa-bell"></i><p>No requests yet</p></div>
                : allRequests.map((r) => <RequestCard key={r.id} r={r} />)
              }
            </div>
          )}
        </main>
      </div>

      {/* Mobile hamburger */}
      <button
        className={`hamburger${sidebarOpen ? ' open' : ''}`}
        id="dashHamburger"
        style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 600, display: 'none' }}
        onClick={() => setSidebarOpen((o) => !o)}
      >
        <span></span><span></span><span></span>
      </button>
    </>
  );
}
