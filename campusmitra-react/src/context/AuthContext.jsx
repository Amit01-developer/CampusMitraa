import { createContext, useContext, useState, useEffect } from 'react';
import { API } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(localStorage.getItem('cs_token'));
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount — verify token and load user
  useEffect(() => {
    if (!authToken) {
      setLoading(false);
      return;
    }
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((user) => {
        if (user) {
          setCurrentUser(user);
          // Check return date reminders on session restore
          triggerReminderCheck(authToken);
        } else {
          logout();
        }
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  function login(token, user) {
    localStorage.setItem('cs_token', token);
    setAuthToken(token);
    setCurrentUser(user);
    // Check return date reminders on fresh login
    triggerReminderCheck(token);
  }

  function logout() {
    localStorage.removeItem('cs_token');
    setAuthToken(null);
    setCurrentUser(null);
  }

  function authHeaders() {
    return {
      Authorization: authToken ? `Bearer ${authToken}` : '',
      'Content-Type': 'application/json',
    };
  }

  return (
    <AuthContext.Provider
      value={{ authToken, currentUser, loading, login, logout, authHeaders }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Fire-and-forget — silently check return reminders after login
function triggerReminderCheck(token) {
  fetch(`${API}/rentals/check-reminders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }).catch(() => {}); // silent — never block login
}

export function useAuth() {
  return useContext(AuthContext);
}
