import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import AuthModal from '../components/AuthModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { API, cachedFetch } from '../utils/api';
import { useScrollRestore } from '../utils/useScrollRestore';
import { catGradient, catIcon } from '../utils/helpers';

export default function Home() {
  const { currentUser } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  useScrollRestore();
  const [heroSearch, setHeroSearch] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('login');

  // Live items for categories section
  const [liveItems, setLiveItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);

  // Load live items on mount — no login needed
  useEffect(() => {
    cachedFetch(`${API}/items`)
      .then((data) => setLiveItems(Array.isArray(data) ? data : []))
      .catch(() => setLiveItems([]))
      .finally(() => setItemsLoading(false));
  }, []);

  // Animate stats on scroll
  useEffect(() => {
    const statEls = document.querySelectorAll('.stat-item h3');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !entry.target.dataset.animated) {
            entry.target.dataset.animated = 'true';
            animateCounter(entry.target, entry.target.textContent);
          }
        });
      },
      { threshold: 0.5 }
    );
    statEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function animateCounter(el, target) {
    const num = parseInt(String(target).replace(/[^0-9]/g, ''));
    if (isNaN(num)) { el.textContent = target; return; }
    const prefix = String(target).includes('₹') ? '₹' : '';
    const suffix = String(target).includes('+') ? '+' : String(target).includes('%') ? '%' : '';
    let start = 0;
    const step = Math.ceil(num / 80);
    const timer = setInterval(() => {
      start = Math.min(start + step, num);
      el.textContent = prefix + start.toLocaleString('en-IN') + suffix;
      if (start >= num) clearInterval(timer);
    }, 16);
  }

  // Load live stats from API
  useEffect(() => {
    // Stats cache: 30 seconds (changes after rentals)
    cachedFetch(`${API}/stats`, 30_000)
      .then((data) => {
        const els = document.querySelectorAll('.stat-item h3');
        if (els[0]) els[0].textContent = data.total_items + '+';
        if (els[1]) els[1].textContent = '₹' + (data.savings / 1000).toFixed(0) + 'K+';
        if (els[2]) els[2].textContent = data.total_users + '+';
        if (els[3]) els[3].textContent = data.satisfaction + '%';
      })
      .catch(() => {}); // silently fall back to hardcoded values
  }, []);

  // Scroll-triggered animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }
        });
      },
      { threshold: 0.1 }
    );
    const animate = (selector, delay = 0) => {
      document.querySelectorAll(selector).forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(25px)';
        el.style.transition = `opacity 0.5s ease ${delay + i * 0.1}s, transform 0.5s ease ${delay + i * 0.1}s`;
        observer.observe(el);
      });
    };
    animate('.step');
    animate('.category-card', 0.1);
    animate('.item-card', 0.05);
    animate('.ai-feature-card', 0.15);
    return () => observer.disconnect();
  }, []);

  // Scroll-to-top button
  useEffect(() => {
    const btn = document.getElementById('scrollTop');
    const header = document.querySelector('header');
    function onScroll() {
      if (btn) btn.classList.toggle('visible', window.scrollY > 400);
      if (header) header.classList.toggle('scrolled', window.scrollY > 10);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleSearch() {
    if (!heroSearch.trim()) { showToast('Please enter something to search', 'error'); return; }
    // Try API search first, fall back to client-side
    fetch(`${API}/search?q=${encodeURIComponent(heroSearch.trim())}`)
      .then((r) => r.json())
      .then((items) => {
        if (!items.length) { showToast(`No items found for "${heroSearch}"`, 'error'); return; }
        const slugs = [...new Set(items.map((i) => i.category_slug))];
        if (slugs.length === 1) {
          showToast(`Found ${items.length} result(s) for "${heroSearch}"`, 'success');
          setTimeout(() => navigate(`/borrower?category=${slugs[0]}`), 400);
        } else {
          showToast(`Found ${items.length} result(s)`, 'success');
          navigate(`/borrower?q=${encodeURIComponent(heroSearch.trim())}`);
        }
      })
      .catch(() => navigate(`/borrower?q=${encodeURIComponent(heroSearch.trim())}`));
  }

  function showCategoryPage(slug) {
    navigate(`/borrower?category=${slug}`);
  }

  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="hero" id="home">
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <div className="hero-badge">
                <i className="fas fa-shield-alt"></i> Student-verified marketplace
              </div>
              <h1>
                Borrow and Share<br />
                <span className="highlight">Campus Essentials</span>
              </h1>
              <p className="tagline">
                Textbooks, electronics, tools, and more — on-demand, student-to-student.
              </p>

              <div className="hero-cta-group">
                <a href="/borrower" className="btn btn-primary btn-hero" style={{ textDecoration: 'none' }}
                  onClick={(e) => { e.preventDefault(); navigate('/borrower'); }}>
                  <i className="fas fa-search"></i> Browse Items
                </a>
                <a href="/owner" className="btn btn-outline btn-hero" style={{ textDecoration: 'none' }}
                  onClick={(e) => { e.preventDefault(); navigate('/owner'); }}>
                  <i className="fas fa-upload"></i> List an Item
                </a>
              </div>

              <p className="hero-trust">
                <i className="fas fa-envelope"></i> College email required
                <span className="trust-dot">•</span>
                <i className="fas fa-lock"></i> Secure deposits
                <span className="trust-dot">•</span>
                <i className="fas fa-star"></i> Rated lenders
              </p>

              <div className="hero-search" role="search">
                <input
                  type="text"
                  id="heroSearch"
                  placeholder="Search laptops, textbooks, calculators…"
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button onClick={handleSearch} aria-label="Search">
                  <i className="fas fa-search"></i>
                </button>
              </div>

              <div className="hero-chips">
                {[
                  { label: 'Electronics', icon: 'fa-laptop', slug: 'electronics' },
                  { label: 'Textbooks', icon: 'fa-book', slug: 'textbooks' },
                  { label: 'Tools', icon: 'fa-tools', slug: 'tools' },
                  { label: 'Clothing', icon: 'fa-tshirt', slug: 'clothing' },
                ].map((c) => (
                  <button
                    key={c.slug}
                    className="chip"
                    onClick={() => showCategoryPage(c.slug)}
                  >
                    <i className={`fas ${c.icon}`}></i> {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hero-image">
              <div className="hero-img-frame">
                <img src="/CampuStudent.jpg" alt="Students sharing campus essentials" loading="eager" />
                <div className="hero-img-overlay"></div>
              </div>
              <div className="hero-float-card hero-float-card--top">
                <i className="fas fa-check-circle"></i>
                <span>Verified student</span>
              </div>
              <div className="hero-float-card hero-float-card--bottom">
                <i className="fas fa-star"></i>
                <span>4.9 avg rating</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="works" id="how">
        <div className="container">
          <div className="section-title">
            <h2>How CampusMitra Works</h2>
            <p>Simple steps to rent or borrow campus items</p>
          </div>
          <div className="works-steps">
            {[
              { n: 1, title: 'Sign Up & Verify', desc: 'Create your student profile with campus email verification.' },
              { n: 2, title: 'List or Browse', desc: 'List items you want to rent out or browse available items.' },
              { n: 3, title: 'Connect & Arrange', desc: 'Connect with other students and arrange pickup on campus.' },
              { n: 4, title: 'Share & Earn', desc: 'Borrow what you need, rent out what you don\'t use.' },
            ].map((s) => (
              <div className="step" key={s.n}>
                <div className="step-number">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="categories" id="categories">
        <div className="container">
          <div className="section-title">
            <h2>Popular Rental Categories</h2>
            <p>What students are sharing on campus</p>
          </div>
          <div className="categories-grid">
            {[
              { slug: 'electronics', icon: 'fa-laptop', title: 'Electronics', desc: 'Laptops, tablets, calculators, cameras for short-term projects', time: 'Daily/Weekly rental', grad: 'linear-gradient(135deg,#4f46e5,#6366f1)' },
              { slug: 'textbooks', icon: 'fa-book', title: 'Textbooks & Study', desc: 'Rent textbooks for the semester or borrow for specific chapters', time: 'Semester/Chapter rental', grad: 'linear-gradient(135deg,#0d9488,#14b8a6)' },
              { slug: 'tools', icon: 'fa-tools', title: 'Tools & Equipment', desc: 'Lab equipment, art supplies, project tools for coursework', time: 'Project-based rental', grad: 'linear-gradient(135deg,#f59e0b,#d97706)' },
              { slug: 'clothing', icon: 'fa-tshirt', title: 'Clothing & Formal Wear', desc: 'Borrow formal attire for presentations, interviews, events', time: 'Event-based rental', grad: 'linear-gradient(135deg,#7c3aed,#8b5cf6)' },
            ].map((c) => {
              const count = liveItems.filter((i) => i.category_slug === c.slug && i.is_available).length;
              return (
                <div className="category-card" key={c.slug} onClick={() => showCategoryPage(c.slug)}
                  style={{ cursor: 'pointer' }}>
                  <div className="category-icon" style={{ background: c.grad }}>
                    <i className={`fas ${c.icon}`}></i>
                  </div>
                  <div className="category-content">
                    <h3>{c.title}</h3>
                    <p>{c.desc}</p>
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ color: 'var(--gray)', fontSize: '0.9rem' }}>
                        <i className="fas fa-clock"></i> {c.time}
                      </span>
                      {!itemsLoading && (
                        <span style={{
                          background: count > 0 ? 'rgba(13,148,136,0.1)' : 'rgba(156,163,175,0.15)',
                          color: count > 0 ? '#0d9488' : 'var(--gray)',
                          borderRadius: 20, padding: '2px 10px',
                          fontSize: '0.78rem', fontWeight: 700,
                        }}>
                          {count > 0 ? `${count} available` : 'None listed yet'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Live Items — visible without login */}
      <section className="featured" id="items">
        <div className="container">
          <div className="section-title">
            <h2>Recently Listed Items</h2>
            <p>Browse items available for rent or borrow — no sign-in needed to explore</p>
          </div>

          {itemsLoading ? (
            /* Skeleton */
            <div className="items-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="ic-skeleton" style={{ borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div className="skel-img" style={{ paddingTop: '56%' }}></div>
                  <div className="skel-body" style={{ padding: '14px 16px' }}>
                    <div className="skel-line"></div>
                    <div className="skel-line short"></div>
                    <div className="skel-line xshort"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : liveItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--gray)' }}>
              <i className="fas fa-box-open" style={{ fontSize: '2.5rem', opacity: 0.3, display: 'block', marginBottom: 12 }}></i>
              <p>No items listed yet. Be the first to list one!</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }}
                onClick={() => currentUser ? navigate('/owner') : (setAuthMode('signup'), setShowAuth(true))}>
                <i className="fas fa-plus"></i> List an Item
              </button>
            </div>
          ) : (
            <>
              <div className="items-grid">
                {liveItems.slice(0, 6).map((item) => (
                  <div className="item-card" key={item.id}>
                    <div className="item-img" style={{ height: 180, overflow: 'hidden', position: 'relative' }}>
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{
                          width: '100%', height: '100%', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          background: catGradient(item.category_slug), fontSize: '3rem', color: 'white',
                        }}>
                          <i className={`fas ${catIcon(item.category_slug)}`}></i>
                        </div>
                      )}
                      {/* availability badge */}
                      <span style={{
                        position: 'absolute', top: 10, left: 10,
                        background: item.is_available ? 'rgba(13,148,136,0.9)' : 'rgba(220,38,38,0.85)',
                        color: '#fff', borderRadius: 20, padding: '2px 10px',
                        fontSize: '0.72rem', fontWeight: 700,
                      }}>
                        {item.is_available ? '✓ Available' : 'Rented'}
                      </span>
                    </div>
                    <div className="item-details">
                      <h3 style={{ marginBottom: 6 }}>{item.name}</h3>
                      <div className="item-meta">
                        <span><i className="fas fa-user"></i> {item.owner?.name || '—'}</span>
                        <span><i className="fas fa-star" style={{ color: 'var(--accent)' }}></i> 4.8</span>
                      </div>
                      <div className="item-price">{item.price || '—'}</div>
                      {item.description && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--gray)', marginBottom: 12,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {item.description}
                        </p>
                      )}
                      <div className="item-actions">
                        {/* View Details — always free */}
                        <button className="btn btn-borrow btn-small"
                          onClick={() => navigate(`/borrower?category=${item.category_slug || ''}`)}>
                          <i className="fas fa-eye"></i> View
                        </button>
                        {/* Borrow/Rent — requires login */}
                        <button
                          className="btn btn-rent btn-small"
                          disabled={!item.is_available}
                          onClick={() => {
                            if (!currentUser) { setAuthMode('login'); setShowAuth(true); return; }
                            navigate(`/borrower?category=${item.category_slug || ''}`);
                          }}
                        >
                          <i className="fas fa-handshake"></i>
                          {currentUser ? 'Rent Now' : 'Sign in to Rent'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {liveItems.length > 6 && (
                <div style={{ textAlign: 'center', marginTop: 32 }}>
                  <button className="btn btn-outline"
                    onClick={() => navigate('/borrower')}>
                    <i className="fas fa-th-large"></i> View All {liveItems.length} Items
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* AI Features Section */}
      <section className="ai-features" id="ai">
        <div className="container">
          <div className="section-title">
            <span style={{ display:'inline-block', background:'linear-gradient(135deg,#f59e0b,#ef4444)', color:'#fff', fontSize:'0.75rem', fontWeight:700, letterSpacing:1, padding:'4px 14px', borderRadius:20, marginBottom:14, textTransform:'uppercase' }}>🚀 Coming Soon</span>
            <h2>Future Scope — AI-Powered Smart Features</h2>
            <p>These intelligent features are currently in planning and will be rolled out in upcoming versions.</p>
          </div>
          <div className="ai-feature-card" style={{ opacity:0.85, position:'relative' }}>
            <div className="ai-feature-content">
              <h2>Smart Matching Algorithm <span style={{ fontSize:'0.65rem', background:'#f59e0b', color:'#000', padding:'2px 10px', borderRadius:12, verticalAlign:'middle', fontWeight:700 }}>PLANNED</span></h2>
              <p>Our AI will match borrowers with lenders based on location, item requirements, rental history, and compatibility scores.</p>
              <ul style={{ marginTop:20, listStyle:'none' }}>
                <li style={{ marginBottom:10 }}><i className="fas fa-clock" style={{ color:'#f59e0b' }}></i> <strong>Location-Based Matching:</strong> Find items in your hostel/campus area</li>
                <li style={{ marginBottom:10 }}><i className="fas fa-clock" style={{ color:'#f59e0b' }}></i> <strong>Trust Scoring:</strong> AI-calculated reliability scores</li>
                <li style={{ marginBottom:10 }}><i className="fas fa-clock" style={{ color:'#f59e0b' }}></i> <strong>Schedule Optimization:</strong> Optimal pickup/return times</li>
                <li><i className="fas fa-clock" style={{ color:'#f59e0b' }}></i> <strong>Price Suggestions:</strong> Fair rental prices based on demand</li>
              </ul>
            </div>
            <div className="ai-feature-visual">
              <i className="fas fa-robot"></i>
              <h3>AI Match Score: 92%</h3>
              <p>Coming in a future release!</p>
            </div>
          </div>
          <div className="ai-feature-card" style={{ opacity:0.85 }}>
            <div className="ai-feature-visual" style={{ background:'linear-gradient(135deg,var(--secondary),var(--secondary-dark))' }}>
              <i className="fas fa-shield-alt"></i>
              <h3>Safety First</h3>
              <p>Planned for upcoming version</p>
            </div>
            <div className="ai-feature-content">
              <h2>AI Safety &amp; Verification <span style={{ fontSize:'0.65rem', background:'#f59e0b', color:'#000', padding:'2px 10px', borderRadius:12, verticalAlign:'middle', fontWeight:700 }}>PLANNED</span></h2>
              <p>Advanced safety features will ensure secure sharing between verified students only.</p>
              <ul style={{ marginTop:20, listStyle:'none' }}>
                <li style={{ marginBottom:10 }}><i className="fas fa-clock" style={{ color:'#f59e0b' }}></i> <strong>Student Verification:</strong> Campus email and ID verification</li>
                <li style={{ marginBottom:10 }}><i className="fas fa-clock" style={{ color:'#f59e0b' }}></i> <strong>Item Condition Tracking:</strong> AI analysis of before/after photos</li>
                <li style={{ marginBottom:10 }}><i className="fas fa-clock" style={{ color:'#f59e0b' }}></i> <strong>Smart Contracts:</strong> Automated rental agreements</li>
                <li><i className="fas fa-clock" style={{ color:'#f59e0b' }}></i> <strong>Fraud Detection:</strong> AI monitoring for suspicious activities</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="stats">
        <div className="container">
          <div className="stats-grid">
            {[
              { val: '100+', label: 'Items Available for Rent' },
              { val: '₹20,000+', label: 'Saved by Students' },
              { val: '40+', label: 'Campus Communities' },
              { val: '90%', label: 'Satisfaction Rate' },
            ].map((s) => (
              <div className="stat-item" key={s.label}>
                <h3>{s.val}</h3>
                <p>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="container">
          <h2>Start Sharing on Your Campus Today!</h2>
          <p>Join thousands of students who are saving money and building community through sharing.</p>
          <div style={{ display: 'flex', gap: 15, justifyContent: 'center', flexWrap: 'wrap', marginTop: 40 }}>
            <button
              className="btn btn-primary"
              style={{ background: 'white', color: 'var(--primary)', fontSize: '1.1rem', padding: '15px 40px' }}
              onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
            >
              <i className="fas fa-user-plus"></i> Join CampusMitra
            </button>
            <button
              className="btn btn-outline"
              style={{ borderColor: 'white', color: 'white', fontSize: '1.1rem', padding: '15px 40px' }}
              onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <i className="fas fa-play-circle"></i> How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="container">
          <div className="footer-content">
            <div className="footer-column">
              <h3>CampusMitra</h3>
              <p>AI-powered platform for students to rent, borrow, and share campus essentials. Sustainable, economical, and community-focused.</p>
              <div style={{ display:'flex', gap:15, marginTop:20, fontSize:'1.4rem' }}>
                <a href="#" style={{ color:'#1877f2' }}><i className="fab fa-facebook"></i></a>
                <a href="https://x.com/RaniRajput8090" style={{ color:'#55b3ee' }}><i className="fab fa-twitter"></i></a>
                <a href="#" style={{ color:'#e74077' }}><i className="fab fa-instagram"></i></a>
                <a href="https://www.linkedin.com/in/rani-rajput-75a788336/" style={{ color:'#1c80b7' }}><i className="fab fa-linkedin"></i></a>
              </div>
            </div>
            <div className="footer-column">
              <h3>For Borrowers</h3>
              <ul>
                <li><a href="#">Browse Items</a></li>
                <li><a href="#">How to Borrow</a></li>
                <li><a href="#">Safety Guidelines</a></li>
                <li><a href="#">Borrower FAQ</a></li>
                <li><a href="#">Campus Zones</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h3>For Lenders</h3>
              <ul>
                <li><a href="#">List Your Item</a></li>
                <li><a href="#">Pricing Tips</a></li>
                <li><a href="#">Lender Protection</a></li>
                <li><a href="#">Rental Agreement</a></li>
                <li><a href="#">Earnings Dashboard</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h3>Company</h3>
              <ul>
                <li><a href="#">About Us</a></li>
                <li><a href="#">For Campuses</a></li>
                <li><a href="#">Careers</a></li>
                <li><a href="#">Privacy Policy</a></li>
                <li><a href="#">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="copyright">
            <h3>© 2026 CampusMitra. All rights reserved. Designed for students to share resources sustainably.</h3>
          </div>
        </div>
      </footer>

      {showAuth && (
        <AuthModal mode={authMode} onClose={() => setShowAuth(false)} onSwitchMode={setAuthMode} />
      )}

      {/* Scroll to top button */}
      <button
        id="scrollTop"
        className="scroll-top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
      >
        <i className="fas fa-arrow-up"></i>
      </button>
    </>
  );
}
