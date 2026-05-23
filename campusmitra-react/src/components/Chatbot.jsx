import { useState, useRef, useEffect } from 'react';
import { API } from '../utils/api';

const SUGGESTIONS = {
  hinglish: [
    'CampusMitra kya hai?',
    'Item kaise rent karein?',
    'Apni cheez kaise list karein?',
    'Kya categories hain?',
    'Kya ye safe hai?',
    'Pricing kya hai?',
  ],
  english: [
    'What is CampusMitra?',
    'How to rent an item?',
    'How to list my item?',
    'What categories are available?',
    'Is this platform safe?',
    'How does pricing work?',
  ],
};

const WELCOME = {
  hinglish: '👋 Namaste! Main CampusMitra ka AI assistant hoon.\n\nCampusMitra ke baare mein kuch bhi poochho — rent, borrow, list item, safety, pricing — sab bataunga! 😊',
  english: '👋 Hello! I am CampusMitra\'s AI assistant.\n\nAsk me anything about CampusMitra — renting, borrowing, listing items, safety, pricing — I\'ve got you covered! 😊',
};

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState('hinglish'); // 'hinglish' | 'english'
  const [messages, setMessages] = useState([
    { role: 'bot', text: WELCOME.hinglish },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const messagesEndRef = useRef(null);

  // When language changes, add a bot message acknowledging the switch
  function switchLang(newLang) {
    if (newLang === lang) return;
    setLang(newLang);
    const switchMsg = newLang === 'english'
      ? '🌐 Switched to English! Ask me anything.'
      : '🌐 Hinglish mein switch ho gaya! Kuch bhi poochho.';
    setMessages((prev) => [...prev, { role: 'bot', text: switchMsg }]);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text) {
    if (!text.trim()) return;
    const userMsg = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Append language instruction to message so backend/Gemini knows
    const langHint = lang === 'english'
      ? ' [Please reply in English only]'
      : ' [Please reply in Hinglish — mix of Hindi and English]';

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text + langHint, history, lang }),
      });
      const data = await res.json();
      const reply = data.reply || data.error || (lang === 'english' ? 'Something went wrong. Please try again!' : 'Kuch problem aayi. Dobara try karo!');
      setMessages((prev) => [...prev, { role: 'bot', text: reply }]);
      setHistory((prev) => {
        const updated = [...prev, { role: 'user', text }, { role: 'model', text: reply }];
        return updated.slice(-20);
      });
    } catch (err) {
      console.error('Chatbot fetch error:', err);
      const msg = !navigator.onLine
        ? (lang === 'english' ? 'You are offline. Please check your internet connection. 🙏' : 'Aap offline hain. Internet check karo aur dobara try karo. 🙏')
        : (lang === 'english' ? `Cannot connect to backend. Is it running? (${err.message})` : `Backend se connect nahi ho pa raha. Kya backend chal raha hai? (${err.message})`);
      setMessages((prev) => [...prev, { role: 'bot', text: msg }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        id="cm-chat-toggle"
        aria-label={open ? 'Close chatbot' : 'Open CampusMitra chatbot'}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28, width: 58, height: 58,
          borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#0d9488)',
          color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 24px rgba(79,70,229,0.45)', zIndex: 9990,
          transition: 'transform 0.25s, box-shadow 0.25s',
        }}
      >
        <i className="fas fa-robot"></i>
        {!open && (
          <span style={{
            position: 'absolute', top: 4, right: 4, width: 12, height: 12,
            background: '#f59e0b', borderRadius: '50%', border: '2px solid #fff',
          }} />
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div
          style={{
            position: 'fixed', bottom: 100, right: 28, width: 360, maxHeight: 560,
            background: 'var(--card-bg,#fff)', border: '1px solid var(--border,#e5e7eb)',
            borderRadius: 20, boxShadow: '0 20px 60px rgba(79,70,229,0.18)',
            display: 'flex', flexDirection: 'column', zIndex: 9989, overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg,#4f46e5,#0d9488)', color: '#fff',
            padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(255,255,255,0.2)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
            }}>
              <i className="fas fa-robot"></i>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>CampusMitra Assistant</div>
              <div style={{ fontSize: '0.72rem', opacity: 0.85, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, background: '#4ade80', borderRadius: '50%', display: 'inline-block' }} />
                Gemini AI • Online
              </div>
            </div>
            {/* Language toggle */}
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: 3 }}>
              <button
                onClick={() => switchLang('hinglish')}
                title="Hinglish"
                style={{
                  padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: '0.7rem', fontWeight: 700, fontFamily: 'inherit',
                  background: lang === 'hinglish' ? '#fff' : 'transparent',
                  color: lang === 'hinglish' ? '#4f46e5' : 'rgba(255,255,255,0.85)',
                  transition: 'all 0.2s',
                }}
              >
                HI
              </button>
              <button
                onClick={() => switchLang('english')}
                title="English"
                style={{
                  padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: '0.7rem', fontWeight: 700, fontFamily: 'inherit',
                  background: lang === 'english' ? '#fff' : 'transparent',
                  color: lang === 'english' ? '#4f46e5' : 'rgba(255,255,255,0.85)',
                  transition: 'all 0.2s',
                }}
              >
                EN
              </button>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
                fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
            background: 'var(--bg,#f8faff)',
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, alignItems: 'flex-end',
                flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              }}>
                {m.role === 'bot' && (
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: 'linear-gradient(135deg,#4f46e5,#0d9488)',
                    color: '#fff', fontSize: '0.75rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <i className="fas fa-robot"></i>
                  </div>
                )}
                <div style={{
                  maxWidth: '82%', padding: '10px 14px', borderRadius: 16,
                  fontSize: '0.875rem', lineHeight: 1.55, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                  ...(m.role === 'bot'
                    ? { background: 'var(--card-bg,#fff)', color: 'var(--text,#1f2937)', border: '1px solid var(--border,#e5e7eb)', borderBottomLeftRadius: 4 }
                    : { background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', borderBottomRightRadius: 4 }),
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#4f46e5,#0d9488)', color: '#fff', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fas fa-robot"></i>
                </div>
                <div style={{ padding: '12px 16px', borderRadius: 16, background: 'var(--card-bg,#fff)', border: '1px solid var(--border,#e5e7eb)' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0, 0.2, 0.4].map((d, i) => (
                      <span key={i} style={{
                        width: 7, height: 7, background: 'var(--gray,#6b7280)',
                        borderRadius: '50%', display: 'inline-block',
                        animation: `bounce 1.2s ${d}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          <div style={{
            padding: '8px 14px 4px', display: 'flex', flexWrap: 'wrap', gap: 6,
            background: 'var(--bg,#f8faff)', borderTop: '1px solid var(--border,#e5e7eb)',
          }}>
            {SUGGESTIONS[lang].map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                style={{
                  background: 'var(--card-bg,#fff)', border: '1.5px solid var(--border,#e5e7eb)',
                  color: 'var(--primary,#4f46e5)', fontSize: '0.72rem', fontWeight: 600,
                  padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{
            display: 'flex', gap: 8, padding: '12px 14px',
            borderTop: '1px solid var(--border,#e5e7eb)', background: 'var(--card-bg,#fff)',
          }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder={lang === 'english' ? 'Ask anything…' : 'Kuch bhi poochho…'}
              rows={1}
              style={{
                flex: 1, border: '1.5px solid var(--border,#e5e7eb)', borderRadius: 10,
                padding: '9px 13px', fontSize: '0.875rem', fontFamily: 'inherit',
                background: 'var(--bg,#f8faff)', color: 'var(--text,#1f2937)',
                outline: 'none', resize: 'none',
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'linear-gradient(135deg,#4f46e5,#0d9488)',
                color: '#fff', border: 'none', cursor: 'pointer',
                fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                alignSelf: 'flex-end', opacity: loading || !input.trim() ? 0.45 : 1,
              }}
            >
              <i className="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
