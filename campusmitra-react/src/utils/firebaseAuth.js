// ── Firebase Google Sign-In (npm package — Vite compatible) ─────────────────
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { API } from './api';

const firebaseConfig = {
  apiKey: 'AIzaSyBeNeo2wYkSOc8uYU7Q8WfxLL6hGiGucnA',
  authDomain: 'campus-share-2f42b.firebaseapp.com',
  projectId: 'campus-share-2f42b',
};

// Avoid re-initializing on hot reload
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export async function signInWithGoogle(onSuccess, onError) {
  try {
    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();

    let res;
    try {
      res = await fetch(`${API}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
    } catch (networkErr) {
      onError('Network error: Could not reach server. Is the backend running?');
      return;
    }

    // Guard against empty / non-JSON response
    const text = await res.text();
    if (!text || !text.trim()) {
      onError('Server returned an empty response. Please try again.');
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      onError('Server error: Invalid response format. Please try again.');
      return;
    }

    if (!res.ok || data.error) {
      onError(data.error || 'Google login failed');
      return;
    }

    localStorage.setItem('cs_token', data.token);
    onSuccess(data);
  } catch (err) {
    const msg =
      err.code === 'auth/popup-closed-by-user'
        ? 'Sign-in popup was closed. Please try again.'
        : err.code === 'auth/popup-blocked'
        ? 'Popup was blocked. Please allow popups for this site.'
        : err.code === 'auth/cancelled-popup-request'
        ? 'Sign-in was cancelled. Please try again.'
        : 'Google sign-in failed: ' + (err.message || 'Unknown error');
    onError(msg);
  }
}
