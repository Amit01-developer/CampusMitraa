import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { API } from '../utils/api';

function StarRating({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          onClick={() => !readonly && onChange && onChange(s)}
          onMouseEnter={() => !readonly && setHover(s)}
          onMouseLeave={() => !readonly && setHover(0)}
          style={{
            fontSize: readonly ? '0.9rem' : '1.3rem',
            cursor: readonly ? 'default' : 'pointer',
            color: s <= (hover || value) ? '#f59e0b' : '#d1d5db',
            transition: 'color 0.15s',
          }}
        >★</span>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const { userId } = useParams();
  const { currentUser, authHeaders } = useAuth();
  const showToast = useToast();
  const navigate  = useNavigate();

  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [editing, setEditing]     = useState(false);
  const [editForm, setEditForm]   = useState({});

  // Review form
  const [reviewRating,  setReviewRating]  = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewRental,  setReviewRental]  = useState('');
  const [submittingRev, setSubmittingRev] = useState(false);

  // Referral
  const [referral,     setReferral]     = useState(null);
  const [refCode,      setRefCode]      = useState('');
  const [applyingRef,  setApplyingRef]  = useState(false);

  const isOwnProfile = currentUser && (userId === currentUser.id || !userId);
  const targetId     = userId || currentUser?.id;

  // Wait for currentUser to load before fetching profile
  useEffect(() => {
    // If no userId in URL and no currentUser yet, wait
    if (!userId && !currentUser) return;
    // If userId in URL, we can fetch immediately (public profile)
    // If no userId, we need currentUser
    const id = userId || currentUser?.id;
    if (!id) { navigate('/'); return; }
    loadProfile(id);
    if (currentUser && (userId === currentUser.id || !userId)) loadReferral();
  }, [userId, currentUser]);

  async function loadProfile(id) {
    const resolvedId = id || targetId;
    if (!resolvedId) return;
    setLoading(true);
    try {
      const headers = currentUser ? authHeaders() : { 'Content-Type': 'application/json' };
      const res  = await fetch(`${API}/profile/${resolvedId}`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Could not load profile', 'error');
        navigate('/');
        return;
      }
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); navigate('/'); return; }
      setProfile(data);
      setEditForm({
        name: data.name || '', department: data.department || '',
        year: data.year || '', campus_zone: data.campus_zone || '',
        bio: data.bio || '',
      });
    } catch {
      showToast('Could not load profile', 'error');
    } finally { setLoading(false); }
  }

  async function loadReferral() {
    try {
      const res  = await fetch(`${API}/referral/code`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.error) setReferral(data);
    } catch { /* silent */ }
  }

  async function saveProfile() {
    try {
      const res  = await fetch(`${API}/profile/me`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); return; }
      setProfile((p) => ({ ...p, ...editForm, ...data }));
      setEditing(false);
      showToast('Profile updated!', 'success');
    } catch { showToast('Could not update profile', 'error'); }
  }

  async function submitReview() {
    if (!reviewRating) { showToast('Please select a rating', 'error'); return; }
    if (!reviewRental)  { showToast('Please select a rental', 'error'); return; }
    setSubmittingRev(true);
    try {
      const res  = await fetch(`${API}/reviews`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          rental_id: reviewRental, rating: reviewRating,
          comment: reviewComment, review_for: targetId,
        }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); return; }
      showToast(`Review submitted! New trust score: ${data.new_trust_score}⭐`, 'success');
      setReviewRating(0); setReviewComment(''); setReviewRental('');
      loadProfile();
    } catch { showToast('Could not submit review', 'error'); }
    finally { setSubmittingRev(false); }
  }

  async function applyReferral() {
    if (!refCode.trim()) { showToast('Please enter a referral code', 'error'); return; }
    setApplyingRef(true);
    try {
      const res  = await fetch(`${API}/referral/apply`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ code: refCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); return; }
      showToast(data.message, 'success');
      setRefCode('');
      loadReferral();
    } catch { showToast('Could not apply referral', 'error'); }
    finally { setApplyingRef(false); }
  }

  function copyCode() {
    navigator.clipboard.writeText(referral?.code || '');
    showToast('Code copied!', 'success');
  }

  if (loading) return (
    <>
      <Navbar />
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'60vh' }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize:'2rem', color:'var(--primary)' }}></i>
      </div>
    </>
  );

  // Not logged in and no userId — redirect to home
  if (!profile && !loading) {
    navigate('/');
    return null;
  }

  if (!profile) return null;

  const trustColor = profile.trust_score >= 4.5 ? '#10b981'
    : profile.trust_score >= 3.5 ? '#f59e0b' : '#ef4444';

  // Rentals where current user can leave a review for this profile owner
  // profile.lends  = rentals where profile owner was the LENDER  → currentUser was borrower
  // profile.borrows = rentals where profile owner was the BORROWER → currentUser was lender
  const reviewableRentals = !currentUser || isOwnProfile ? [] : [
    ...(profile.lends   || []).filter((r) =>
      r.status === 'returned' && r.borrower_id === currentUser.id
    ),
    ...(profile.borrows || []).filter((r) =>
      r.status === 'returned' && r.lender_id === currentUser.id
    ),
  ];

  const tabs = [
    { id: 'overview',  label: 'Overview',  icon: 'fa-chart-pie' },
    { id: 'reviews',   label: `Reviews (${profile.review_count || 0})`, icon: 'fa-star' },
    { id: 'items',     label: `Items (${profile.total_items_listed || 0})`, icon: 'fa-box-open' },
    ...(isOwnProfile ? [{ id: 'referral', label: 'Referral', icon: 'fa-gift' }] : []),
  ];

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Profile Header Card */}
        <div style={{
          background: 'var(--card-bg, #fff)', borderRadius: 16,
          border: '1px solid var(--border, #e5e7eb)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 24,
        }}>
          <div style={{ background: 'linear-gradient(135deg,#4f46e5,#0d9488)', height: 80 }} />
          <div style={{ padding: '0 24px 24px', marginTop: -36 }}>
            <div style={{ display:'flex', alignItems:'flex-end', gap:16, flexWrap:'wrap' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg,#4f46e5,#0d9488)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'1.8rem', fontWeight:700, color:'#fff',
                border: '4px solid var(--card-bg, #fff)',
                boxShadow: '0 4px 12px rgba(79,70,229,0.3)',
              }}>
                {profile.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ flex:1, paddingBottom: 4 }}>
                {editing ? (
                  <input value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    style={{ fontSize:'1.3rem', fontWeight:700, border:'1px solid var(--border)', borderRadius:8, padding:'4px 10px', background:'var(--bg)', color:'var(--text)' }} />
                ) : (
                  <h1 style={{ margin:0, fontSize:'1.4rem', color:'var(--text, #1f2937)' }}>{profile.name}</h1>
                )}
                <p style={{ margin:'4px 0 0', color:'var(--gray)', fontSize:'0.85rem' }}>
                  {profile.department}{profile.year ? ` · Year ${profile.year}` : ''}
                  {profile.campus_zone ? ` · 📍 ${profile.campus_zone}` : ''}
                </p>
              </div>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'1.4rem', fontWeight:800, color: trustColor }}>{profile.trust_score?.toFixed(1)}</div>
                  <div style={{ fontSize:'0.7rem', color:'var(--gray)' }}>Trust Score</div>
                </div>
                {isOwnProfile && (
                  editing
                    ? <button onClick={saveProfile} style={{ background:'#4f46e5', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontWeight:600 }}>Save</button>
                    : <button onClick={() => setEditing(true)} style={{ background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontWeight:600 }}><i className="fas fa-edit"></i> Edit</button>
                )}
              </div>
            </div>

            {/* Edit fields */}
            {editing && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16 }}>
                {[
                  { key:'department', label:'Department', placeholder:'e.g. Computer Science' },
                  { key:'year',       label:'Year',       placeholder:'e.g. 3' },
                  { key:'campus_zone',label:'Campus Zone',placeholder:'e.g. Hostel Block A' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize:'0.78rem', color:'var(--gray)', display:'block', marginBottom:4 }}>{label}</label>
                    <input value={editForm[key]} placeholder={placeholder}
                      onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                      style={{ width:'100%', border:'1px solid var(--border)', borderRadius:8, padding:'7px 10px', background:'var(--bg)', color:'var(--text)', fontSize:'0.88rem', boxSizing:'border-box' }} />
                  </div>
                ))}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:'0.78rem', color:'var(--gray)', display:'block', marginBottom:4 }}>Bio</label>
                  <textarea value={editForm.bio} placeholder="Write something about yourself…" rows={2}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    style={{ width:'100%', border:'1px solid var(--border)', borderRadius:8, padding:'7px 10px', background:'var(--bg)', color:'var(--text)', fontSize:'0.88rem', resize:'vertical', boxSizing:'border-box' }} />
                </div>
              </div>
            )}

            {/* Bio display */}
            {!editing && profile.bio && (
              <p style={{ margin:'12px 0 0', color:'var(--text)', fontSize:'0.88rem', lineHeight:1.6 }}>{profile.bio}</p>
            )}

            {/* Stats row */}
            <div style={{ display:'flex', gap:24, marginTop:16, flexWrap:'wrap' }}>
              {[
                { icon:'fa-box-open',    val: profile.total_items_listed || 0, label:'Items Listed' },
                { icon:'fa-check-circle',val: profile.completed_rentals  || 0, label:'Completed' },
                { icon:'fa-star',        val: profile.avg_rating?.toFixed(1) || '5.0', label:'Avg Rating' },
                { icon:'fa-users',       val: profile.review_count || 0, label:'Reviews' },
              ].map(({ icon, val, label }) => (
                <div key={label} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--text)' }}>
                    <i className={`fas ${icon}`} style={{ color:'var(--primary)', marginRight:5, fontSize:'0.85rem' }}></i>{val}
                  </div>
                  <div style={{ fontSize:'0.72rem', color:'var(--gray)' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid var(--border,#e5e7eb)', paddingBottom:0 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                background:'none', border:'none', cursor:'pointer', padding:'10px 16px',
                fontWeight: activeTab === t.id ? 700 : 500,
                color: activeTab === t.id ? 'var(--primary,#4f46e5)' : 'var(--gray)',
                borderBottom: activeTab === t.id ? '2px solid var(--primary,#4f46e5)' : '2px solid transparent',
                marginBottom: -2, fontSize:'0.88rem', transition:'color 0.2s',
              }}>
              <i className={`fas ${t.icon}`} style={{ marginRight:6 }}></i>{t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div>
            {/* Trust Score Breakdown */}
            <div style={{ background:'var(--card-bg,#fff)', borderRadius:12, border:'1px solid var(--border)', padding:20, marginBottom:16 }}>
              <h3 style={{ margin:'0 0 14px', fontSize:'0.95rem', color:'var(--text)' }}>
                <i className="fas fa-shield-alt" style={{ color:'#4f46e5', marginRight:8 }}></i>Trust Score Breakdown
              </h3>
              <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12 }}>
                <div style={{ fontSize:'2.5rem', fontWeight:800, color: trustColor }}>{profile.trust_score?.toFixed(1)}</div>
                <div>
                  <StarRating value={Math.round(profile.trust_score || 5)} readonly />
                  <div style={{ fontSize:'0.75rem', color:'var(--gray)', marginTop:4 }}>Based on {profile.review_count || 0} reviews</div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { label:'Completed Rentals', val: profile.completed_rentals || 0, icon:'fa-check-circle', color:'#10b981' },
                  { label:'Cancelled Rentals', val: profile.cancelled_rentals || 0, icon:'fa-times-circle', color:'#ef4444' },
                  { label:'Items Listed',       val: profile.total_items_listed || 0, icon:'fa-box-open',    color:'#4f46e5' },
                  { label:'Reviews Received',   val: profile.review_count || 0,       icon:'fa-star',        color:'#f59e0b' },
                ].map(({ label, val, icon, color }) => (
                  <div key={label} style={{ background:'var(--surface)', borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
                    <i className={`fas ${icon}`} style={{ color, fontSize:'1.1rem' }}></i>
                    <div>
                      <div style={{ fontWeight:700, fontSize:'1rem', color:'var(--text)' }}>{val}</div>
                      <div style={{ fontSize:'0.72rem', color:'var(--gray)' }}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Leave a Review (only if not own profile and has completed rental) */}
            {!isOwnProfile && currentUser && reviewableRentals.length > 0 && (
              <div style={{ background:'var(--card-bg,#fff)', borderRadius:12, border:'1px solid var(--border)', padding:20 }}>
                <h3 style={{ margin:'0 0 14px', fontSize:'0.95rem', color:'var(--text)' }}>
                  <i className="fas fa-star" style={{ color:'#f59e0b', marginRight:8 }}></i>Leave a Review
                </h3>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:'0.8rem', color:'var(--gray)', display:'block', marginBottom:6 }}>Select Rental</label>
                  <select value={reviewRental} onChange={(e) => setReviewRental(e.target.value)}
                    style={{ width:'100%', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', background:'var(--bg)', color:'var(--text)', fontSize:'0.88rem' }}>
                    <option value="">-- Select a rental --</option>
                    {reviewableRentals.map((r) => (
                      <option key={r.id} value={r.id}>{r.item?.name || 'Item'} ({r.start_date} → {r.end_date})</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:'0.8rem', color:'var(--gray)', display:'block', marginBottom:6 }}>Rating</label>
                  <StarRating value={reviewRating} onChange={setReviewRating} />
                </div>
                <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share your experience (optional)…" rows={3}
                  style={{ width:'100%', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', background:'var(--bg)', color:'var(--text)', fontSize:'0.88rem', resize:'vertical', boxSizing:'border-box', marginBottom:12 }} />
                <button onClick={submitReview} disabled={submittingRev || !reviewRating}
                  style={{ background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#fff', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontWeight:600, opacity: submittingRev || !reviewRating ? 0.6 : 1 }}>
                  {submittingRev ? <><i className="fas fa-spinner fa-spin"></i> Submitting…</> : <><i className="fas fa-star"></i> Submit Review</>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── REVIEWS TAB ── */}
        {activeTab === 'reviews' && (
          <div>
            {profile.reviews?.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'var(--gray)' }}>
                <i className="fas fa-star" style={{ fontSize:'2.5rem', marginBottom:12, display:'block', opacity:0.3 }}></i>
                <p>No reviews yet</p>
              </div>
            ) : profile.reviews?.map((r) => (
              <div key={r.id} style={{ background:'var(--card-bg,#fff)', borderRadius:12, border:'1px solid var(--border)', padding:16, marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#4f46e5,#0d9488)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'0.9rem' }}>
                    {r.reviewer_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight:600, fontSize:'0.88rem', color:'var(--text)' }}>{r.reviewer_name}</div>
                    <div style={{ fontSize:'0.72rem', color:'var(--gray)' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : ''}
                    </div>
                  </div>
                  <div style={{ marginLeft:'auto' }}>
                    <StarRating value={r.rating} readonly />
                  </div>
                </div>
                {r.comment && <p style={{ margin:0, fontSize:'0.85rem', color:'var(--text)', lineHeight:1.55 }}>{r.comment}</p>}
              </div>
            ))}
          </div>
        )}

        {/* ── ITEMS TAB ── */}
        {activeTab === 'items' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
            {profile.items?.length === 0 ? (
              <div style={{ gridColumn:'1/-1', textAlign:'center', padding:40, color:'var(--gray)' }}>
                <i className="fas fa-box-open" style={{ fontSize:'2.5rem', marginBottom:12, display:'block', opacity:0.3 }}></i>
                <p>No items listed yet</p>
              </div>
            ) : profile.items?.map((item) => (
              <div key={item.id} style={{ background:'var(--card-bg,#fff)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden', cursor:'pointer' }}
                onClick={() => navigate(`/borrower?q=${encodeURIComponent(item.name)}`)}>
                <div style={{ height:120, background:'linear-gradient(135deg,#4f46e5,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.5rem', color:'rgba(255,255,255,0.8)' }}>
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : <i className="fas fa-box"></i>
                  }
                </div>
                <div style={{ padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:'0.88rem', color:'var(--text)', marginBottom:4 }}>{item.name}</div>
                  <div style={{ fontSize:'0.8rem', color:'var(--primary)', fontWeight:700 }}>{item.price}</div>
                  <span style={{ fontSize:'0.72rem', padding:'2px 8px', borderRadius:20, background: item.is_available ? '#dcfce7' : '#fee2e2', color: item.is_available ? '#166534' : '#991b1b', marginTop:6, display:'inline-block' }}>
                    {item.is_available ? 'Available' : 'Rented'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── REFERRAL TAB ── */}
        {activeTab === 'referral' && isOwnProfile && (
          <div>
            {/* My Referral Code */}
            <div style={{ background:'linear-gradient(135deg,#4f46e5,#0d9488)', borderRadius:16, padding:24, marginBottom:16, color:'#fff' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <i className="fas fa-gift" style={{ fontSize:'1.4rem' }}></i>
                <h3 style={{ margin:0, fontSize:'1.1rem' }}>Share Your Referral Code</h3>
              </div>
              <p style={{ margin:'0 0 16px', opacity:0.85, fontSize:'0.88rem' }}>
                Invite a friend — both of you get ₹50 credit when they sign up!
              </p>
              {referral ? (
                <>
                  <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <span style={{ fontFamily:'monospace', fontSize:'1.3rem', fontWeight:800, letterSpacing:3 }}>{referral.code}</span>
                    <button onClick={copyCode} style={{ background:'rgba(255,255,255,0.25)', border:'none', color:'#fff', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontWeight:600, fontSize:'0.82rem' }}>
                      <i className="fas fa-copy"></i> Copy
                    </button>
                  </div>
                  <div style={{ display:'flex', gap:20 }}>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:'1.4rem', fontWeight:800 }}>{referral.referral_count}</div>
                      <div style={{ fontSize:'0.72rem', opacity:0.8 }}>Friends Invited</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:'1.4rem', fontWeight:800 }}>₹{referral.credits_earned}</div>
                      <div style={{ fontSize:'0.72rem', opacity:0.8 }}>Credits Earned</div>
                    </div>
                  </div>
                  {referral.share_url && (
                    <button onClick={() => { navigator.clipboard.writeText(referral.share_url); showToast('Link copied!', 'success'); }}
                      style={{ marginTop:14, background:'rgba(255,255,255,0.2)', border:'1px solid rgba(255,255,255,0.4)', color:'#fff', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontWeight:600, fontSize:'0.82rem', width:'100%' }}>
                      <i className="fas fa-share-alt"></i> Share Invite Link
                    </button>
                  )}
                </>
              ) : (
                <div style={{ opacity:0.7 }}><i className="fas fa-spinner fa-spin"></i> Loading…</div>
              )}
            </div>

            {/* Apply a Referral Code */}
            <div style={{ background:'var(--card-bg,#fff)', borderRadius:12, border:'1px solid var(--border)', padding:20 }}>
              <h3 style={{ margin:'0 0 12px', fontSize:'0.95rem', color:'var(--text)' }}>
                <i className="fas fa-ticket-alt" style={{ color:'#10b981', marginRight:8 }}></i>Use a Referral Code
              </h3>
              <p style={{ margin:'0 0 14px', fontSize:'0.83rem', color:'var(--gray)' }}>
                Have a friend's referral code? Apply it and get ₹50 credit!
              </p>
              <div style={{ display:'flex', gap:10 }}>
                <input value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123XY" maxLength={12}
                  style={{ flex:1, border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', background:'var(--bg)', color:'var(--text)', fontSize:'0.9rem', fontFamily:'monospace', letterSpacing:2 }} />
                <button onClick={applyReferral} disabled={applyingRef || !refCode.trim()}
                  style={{ background:'#10b981', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontWeight:600, opacity: applyingRef || !refCode.trim() ? 0.6 : 1 }}>
                  {applyingRef ? <i className="fas fa-spinner fa-spin"></i> : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
