import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from './utils/theme';
import App from './App';

// Apply saved theme before first paint (prevents flash)
initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
