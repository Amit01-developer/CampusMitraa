import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { API } from '../utils/api';
import { catGradient, catIcon, track } from '../utils/helpers';
import { useScrollRestore } from '../utils/useScrollRestore';

// ── Item Card ─────────────────────────────────────────────────────────────────
function ItemCard({ item, onRequest, currentUser }) {
  const savedList = JSON.parse(localStorage.getItem('cm_saved') || '[]');
  const [saved, setSaved] = useState(savedList.includes(item.id));
  const isOwnItem = currentUser && item.owner?.id === currentUser.id;

  function toggleSave(e) {
    e.stopPropagation();
    const list = JSON.parse(localStorage.getItem('cm_saved') || '[]');
    const idx = list.indexOf(item.id);
    if (idx === -1) list.push(item.id);
    else list.splice(idx, 1);
    localStorage.setItem('cm_saved', JSON.stringify(list));
    setSaved(idx === -1);
  }

  const condChip =
    item.condition === 'New' ? <span className="ic-chip cond-new">{item.condition}</span>
    : item.condition === 'Excellent' ? <span className="ic-chip cond-exc">{item.condition}</span>
    : <span className="ic-chip">{item.condition || 'Good'}</span>;

  const availChip = item.is_available
    ? <span className="ic-chip avail-today"><i className="fas fa-circle" style={{ fontSize: '0.45rem', verticalAlign: 'middle' }}></i> Available</span>
    : <span className="ic-chip" style={{ color: '#dc2626', borderColor: 'rgba(220,38,38,0.3)' }}>Rented</span>;

  const catLabels = { electronics: 'Electronics', textbooks: 'Textbooks', tools: 'Tools', clothing: 'Clothing' };
  const ownerName = item.owner?.name || '—';
  const ownerDept = item.owner?.department ? ' · ' + item.owner.department : '';
  const zoneChip  = item.campus_zone
    ? <span className="ic-chip" style={{ color: '#0d9488', borderColor: 'rgba(13,148,136,0.3)' }}>📍 {item.campus_zone}</span>
    : null;

  return (
    <div className="item-card-v2" role="article">
      <div className="ic-img">
        {item.image_url
          ? <img src={item.image_url} alt={item.name} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div className="ic-img-placeholder" style={{ background: catGradient(item.category_slug) }}>
              <i className={`fas ${catIcon(item.category_slug)}`} style={{ fontSize: '3rem' }}></i>
            </div>
        }
        <span className="ic-price-chip">{item.price || '—'}</span>
        <button className={`ic-save-btn${saved ? ' saved' : ''}`} onClick={toggleSave} aria-label={saved ? 'Unsave' : 'Save'}>
          <i className={`fa${saved ? 's' : 'r'} fa-heart`}></i>
        </button>
      </div>
      <div className="ic-body">
        <div className="ic-title">{item.name}</div>
        <div className="ic-meta">
          <span className="ic-rating"><i className="fas fa-star"></i> 4.8</span>
          <span className="ic-owner"><i className="fas fa-user-circle"></i> {ownerName}{ownerDept}</span>
        </div>
        <div className="ic-chips">
          {condChip}{availChip}
          {catLabels[item.category_slug] && <span className="ic-chip">{catLabels[item.category_slug]}</span>}
          {zoneChip}
        </div>
        <div className="ic-actions">
          {isOwnItem ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(79,70,229,0.12)', color: '#4f46e5',
              padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
            }}>
              <i className="fas fa-user-check"></i> Your Item
            </span>
          ) : (
            <>
              <button className="ic-borrow-btn" disabled={!item.is_available}
                onClick={() => onRequest(item.id, 'borrow')}>
                <i className="fas fa-handshake"></i> Borrow
              </button>
              {item.owner?.id && (
                <button
                  onClick={() => onRequest(item.id, 'message')}
                  style={{
                    background: 'rgba(13,148,136,0.1)', color: '#0d9488',
                    border: '1px solid rgba(13,148,136,0.3)', borderRadius: 8,
                    padding: '7px 10px', fontSize: '0.78rem', fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  title="Message Owner"
                >
                  <i className="fas fa-comment"></i>
                </button>
              )}
            </>
          )}
          <button className="ic-detail-btn" onClick={() => onRequest(item.id, 'detail')}>
            Details
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BorrowerDashboard() {
  const { currentUser, authHeaders, logout } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useScrollRestore();

  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Overview
  const [ovStats, setOvStats] = useState({ total: 0, active: 0, pending: 0, returned: 0 });
  const [activeRentals, setActiveRentals] = useState([]);

  // Browse
  const [allItems, setAllItems] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [filters, setFilters] = useState({
    category: searchParams.get('category') || '',
    condition: '', unit: '', availability: '', minPrice: '', maxPrice: '',
    campus_zone: '',
  });
  const [sortBy, setSortBy] = useState('default');

  // My Rentals
  const [myRentals, setMyRentals] = useState([]);

  // Campus Zones
  const [zones, setZones] = useState([]);

  useEffect(() => {
    if (!currentUser) { navigate('/'); return; }
    loadOverview();
    loadBrowseItems();
    loadZones();
  }, [currentUser]);

  // ── Overview ────────────────────────────────────────────────────────────
  async function loadOverview() {
    try {
      const res = await fetch(`${API}/rentals?role=borrower`, { headers: authHeaders() });
      const rentals = await res.json();
      setOvStats({
        total: rentals.length,
        active: rentals.filter((r) => r.status === 'active').length,
        pending: rentals.filter((r) => r.status === 'pending').length,
        returned: rentals.filter((r) => r.status === 'returned').length,
      });
      setActiveRentals(rentals.filter((r) => r.status === 'active' || r.status === 'pending'));
    } catch { showToast('Could not load overview', 'error'); }
  }

  // ── Browse ───────────────────────────────────────────────────────────────
  async function loadBrowseItems() {
    setBrowseLoading(true);
    try {
      const res = await fetch(`${API}/items`);
      setAllItems(await res.json());
    } catch {
      setAllItems([]);
      showToast('Could not load items', 'error');
    } finally { setBrowseLoading(false); }
  }

  async function loadZones() {
    try {
      const res  = await fetch(`${API}/zones`);
      const data = await res.json();
      if (Array.isArray(data)) setZones(data);
    } catch { /* silent */ }
  }

  function getFilteredItems() {
    const q = searchQuery.toLowerCase();
    let items = allItems.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) && !(item.description || '').toLowerCase().includes(q)) return false;
      if (filters.category && item.category_slug !== filters.category) return false;
      if (filters.condition && item.condition !== filters.condition) return false;
      if (filters.unit && item.price_unit !== filters.unit) return false;
      if (filters.availability === 'available' && !item.is_available) return false;
      if (filters.availability === 'rented' && item.is_available) return false;
      if (filters.minPrice && (item.price_amount || 0) < parseFloat(filters.minPrice)) return false;
      if (filters.maxPrice && (item.price_amount || 0) > parseFloat(filters.maxPrice)) return false;
      if (filters.campus_zone && (item.campus_zone || '').toLowerCase() !== filters.campus_zone.toLowerCase()) return false;
      return true;
    });
    if (sortBy === 'price_asc') items.sort((a, b) => (a.price_amount || 0) - (b.price_amount || 0));
    if (sortBy === 'price_desc') items.sort((a, b) => (b.price_amount || 0) - (a.price_amount || 0));
    if (sortBy === 'name_asc') items.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'newest') items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return items;
  }

  // ── Request rental ───────────────────────────────────────────────────────
  async function handleRequest(itemId, type) {
    if (!currentUser) { showToast('Please log in first', 'error'); navigate('/'); return; }
    if (type === 'message') {
      try {
        const res  = await fetch(`${API}/items/${itemId}`);
        const item = await res.json();
        if (item.error) { showToast(item.error, 'error'); return; }
        navigate(`/messages?to=${item.owner?.id}&item_name=${encodeURIComponent(item.name)}`);
      } catch { showToast('Could not load item details', 'error'); }
      return;
    }
    if (type === 'detail') {
      try {
        const res = await fetch(`${API}/items/${itemId}`);
        const item = await res.json();
        if (item.error) { showToast(item.error, 'error'); return; }
        const p = new URLSearchParams({
          item_id: item.id, name: item.name, price: item.price,
          price_amount: item.price_amount || 0, price_unit: item.price_unit || 'day',
          condition: item.condition || 'Good', deposit: item.deposit || '—',
          deposit_amount: item.deposit_amount || 0, owner: item.owner?.name || '—',
          category: item.category_slug || 'electronics', rental_type: 'rent',
          description: item.description || '',
        });
        navigate(`/payment?${p.toString()}`);
      } catch { showToast('Could not load item details', 'error'); }
      return;
    }
    try {
      const res = await fetch(`${API}/items/${itemId}`);
      const item = await res.json();
      if (item.error) { showToast(item.error, 'error'); return; }
      const p = new URLSearchParams({
        item_id: item.id, name: item.name, price: item.price,
        price_amount: item.price_amount || 0, price_unit: item.price_unit || 'day',
        condition: item.condition || 'Good', deposit: item.deposit || '—',
        deposit_amount: item.deposit_amount || 0, owner: item.owner?.name || '—',
        category: item.category_slug || 'electronics', rental_type: type,
        description: item.description || '',
      });
      navigate(`/payment?${p.toString()}`);
    } catch { showToast('Could not load item details', 'error'); }
  }

  // ── My Rentals ───────────────────────────────────────────────────────────
  async function loadMyRentals() {
    try {
      const res = await fetch(`${API}/rentals?role=borrower`, { headers: authHeaders() });
      setMyRentals(await res.json());
    } catch { showToast('Could not load rentals', 'error'); }
  }

  async function cancelRental(rentalId) {
    const res = await fetch(`${API}/rentals/${rentalId}/status`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ status: 'cancelled' }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { showToast(data.error || 'Failed', 'error'); return; }
    showToast('Rental cancelled', 'info');
    loadMyRentals();
    loadOverview();
  }

  function switchTab(tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
    if (tab === 'my-rentals') loadMyRentals();
    if (tab === 'browse') loadBrowseItems();
  }

  function RentalCard({ r }) {
    const item = r.item || {};
    const typeBadge = r.rental_type === 'borrow'
      ? <span style={{ background: 'rgba(13,148,136,0.12)', color: '#0d9488', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>Borrow</span>
      : <span style={{ background: 'rgba(79,70,229,0.12)', color: '#4f46e5', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>Rent</span>;

    const depositAmt = r.deposit_amount || 0;
    const depStatus  = r.deposit_status || 'none';
    const depBadge = depositAmt > 0 ? {
      held:      { bg: '#fef3c7', color: '#92400e', icon: 'fa-shield-alt',         text: `Security Deposit Held ₹${Number(depositAmt).toLocaleString('en-IN')}` },
      refunded:  { bg: '#dcfce7', color: '#166534', icon: 'fa-check-circle',        text: `Deposit Refunded ₹${Number(depositAmt).toLocaleString('en-IN')} ✅` },
      forfeited: { bg: '#fee2e2', color: '#991b1b', icon: 'fa-exclamation-triangle', text: `Deposit Forfeited ₹${Number(depositAmt).toLocaleString('en-IN')} ⚠️` },
    }[depStatus] : null;

    return (
      <div className="request-card">
        <div className="request-info">
          <h4>{item.name || 'Item'} &nbsp;{typeBadge}</h4>
          <p>
            <i className="fas fa-tag"></i> {item.price || '—'} &nbsp;|&nbsp;
            <i className="fas fa-calendar"></i>{' '}
            {r.start_date ? new Date(r.start_date).toLocaleDateString('en-IN') : '—'} →{' '}
            {r.end_date ? new Date(r.end_date).toLocaleDateString('en-IN') : '—'} &nbsp;|&nbsp;
            <i className="fas fa-rupee-sign"></i>{' '}
            {r.total_price ? '₹' + Number(r.total_price).toLocaleString('en-IN') : 'Free'}
          </p>
          {depBadge && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: depBadge.bg, color: depBadge.color }}>
              <i className={`fas ${depBadge.icon}`}></i> {depBadge.text}
            </span>
          )}
        </div>
        <div className="request-actions">
          {r.lender_id && (
            <button
              onClick={() => navigate(`/messages?to=${r.lender_id}&rental_id=${r.id}&item_name=${encodeURIComponent(item.name || '')}`)}
              style={{ background: 'rgba(13,148,136,0.1)', color: '#0d9488', border: '1px solid rgba(13,148,136,0.3)', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              title="Message Owner"
            >
              <i className="fas fa-comment"></i> Message
            </button>
          )}
          {r.status === 'pending' || r.status === 'active' ? (
            <button className="btn-reject" onClick={() => cancelRental(String(r.id))}>
              <i className="fas fa-times"></i> {r.status === 'active' ? 'Return Item' : 'Cancel'}
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

  const filteredItems = getFilteredItems();

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
              <div className="sidebar-role">Borrower</div>
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
              { tab: 'browse', icon: 'fa-search', label: 'Browse Items' },
              { tab: 'my-rentals', icon: 'fa-receipt', label: 'My Rentals', badge: ovStats.active + ovStats.pending },
            ].map(({ tab, icon, label, badge }) => (
              <a key={tab} href="#"
                className={`sidebar-link${activeTab === tab ? ' active' : ''}`}
                onClick={(e) => { e.preventDefault(); switchTab(tab); }}>
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
                <p>Find items to borrow and track your active rentals.</p>
              </div>
              <div className="overview-cards">
                {[
                  { icon: 'fa-receipt', num: ovStats.total, label: 'Total Rentals', cls: 'indigo' },
                  { icon: 'fa-spinner', num: ovStats.active, label: 'Active Now', cls: 'teal' },
                  { icon: 'fa-clock', num: ovStats.pending, label: 'Pending Approval', cls: 'amber' },
                  { icon: 'fa-check-double', num: ovStats.returned, label: 'Returned', cls: 'purple' },
                ].map((c) => (
                  <div key={c.label} className={`ov-card ${c.cls}`}>
                    <i className={`fas ${c.icon}`}></i>
                    <div><div className="ov-num">{c.num}</div><div className="ov-label">{c.label}</div></div>
                  </div>
                ))}
              </div>
              <div className="dash-section-title">Your Active Rentals</div>
              {activeRentals.length === 0
                ? <div className="empty-state"><i className="fas fa-inbox"></i><p>No active rentals</p></div>
                : activeRentals.map((r) => <RentalCard key={r.id} r={r} />)
              }
            </div>
          )}

          {/* BROWSE */}
          {activeTab === 'browse' && (
            <div className="tab-content active">
              <div className="dash-header">
                <div>
                  <h1>Browse Available Items</h1>
                  <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginTop: 2 }}>
                    {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} found
                  </p>
                </div>
              </div>

              {/* Search */}
              <div className="p3-search-wrap">
                <div className="p3-search-bar">
                  <i className="fas fa-search p3-search-icon"></i>
                  <input type="text" className="p3-search-input"
                    placeholder="Search laptops, textbooks, calculators…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)} />
                  {searchQuery && (
                    <button className="p3-search-clear" onClick={() => setSearchQuery('')}>
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="p3-filter-bar">
                <div className="p3-filter-row">
                  {[
                    { id: 'category', label: 'Category', options: [['', 'All'], ['electronics', 'Electronics'], ['textbooks', 'Textbooks'], ['tools', 'Tools'], ['clothing', 'Clothing']] },
                    { id: 'condition', label: 'Condition', options: [['', 'Any'], ['New', 'New'], ['Excellent', 'Excellent'], ['Good', 'Good']] },
                    { id: 'unit', label: 'Price Unit', options: [['', 'Any'], ['day', 'Per Day'], ['week', 'Per Week'], ['month', 'Per Month']] },
                    { id: 'availability', label: 'Availability', options: [['', 'All'], ['available', 'Available Now'], ['rented', 'Rented']] },
                  ].map(({ id, label, options }) => (
                    <div key={id} className="p3-filter-group">
                      <label className="p3-filter-label">{label}</label>
                      <select className="p3-filter-select" value={filters[id]}
                        onChange={(e) => setFilters({ ...filters, [id]: e.target.value })}>
                        {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                      </select>
                    </div>
                  ))}
                  {/* Campus Zone filter */}
                  {zones.length > 0 && (
                    <div className="p3-filter-group">
                      <label className="p3-filter-label">📍 Campus Zone</label>
                      <select className="p3-filter-select" value={filters.campus_zone}
                        onChange={(e) => setFilters({ ...filters, campus_zone: e.target.value })}>
                        <option value="">All Zones</option>
                        {zones.map((z) => (
                          <option key={z.zone} value={z.zone}>{z.zone} ({z.item_count})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="p3-filter-group p3-price-range">
                    <label className="p3-filter-label">Price Range (₹)</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" className="p3-price-input" placeholder="Min"
                        value={filters.minPrice} onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })} />
                      <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>–</span>
                      <input type="number" className="p3-price-input" placeholder="Max"
                        value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="p3-filter-actions">
                  <div className="p3-sort-wrap">
                    <label className="p3-filter-label">Sort by</label>
                    <select className="p3-filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                      <option value="default">Default</option>
                      <option value="price_asc">Price: Low → High</option>
                      <option value="price_desc">Price: High → Low</option>
                      <option value="name_asc">Name A–Z</option>
                      <option value="newest">Newest First</option>
                    </select>
                  </div>
                  <button className="p3-clear-btn"
                    onClick={() => { setSearchQuery(''); setFilters({ category: '', condition: '', unit: '', availability: '', minPrice: '', maxPrice: '', campus_zone: '' }); setSortBy('default'); }}>
                    <i className="fas fa-times"></i> Clear All
                  </button>
                </div>
              </div>

              {/* Grid */}
              {browseLoading ? (
                <div className="browse-grid-v2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="ic-skeleton">
                      <div className="skel-img"></div>
                      <div className="skel-body">
                        <div className="skel-line"></div>
                        <div className="skel-line short"></div>
                        <div className="skel-line xshort"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="empty-state"><i className="fas fa-search"></i><p>No items found.</p></div>
              ) : (
                <div className="browse-grid-v2">
                  {filteredItems.map((item) => (
                    <ItemCard key={item.id} item={item} onRequest={handleRequest} currentUser={currentUser} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MY RENTALS */}
          {activeTab === 'my-rentals' && (
            <div className="tab-content active">
              <div className="dash-header">
                <h1>My Rentals</h1>
                <p>All your past and current rental requests.</p>
              </div>
              {myRentals.length === 0
                ? <div className="empty-state"><i className="fas fa-receipt"></i><p>No rentals yet</p></div>
                : myRentals.map((r) => <RentalCard key={r.id} r={r} />)
              }
            </div>
          )}
        </main>
      </div>
    </>
  );
}
