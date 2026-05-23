import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Saves and restores scroll position for .dash-main (or window) per route.
 * Call this hook at the top of any page component.
 */
export function useScrollRestore() {
  const { pathname } = useLocation();
  const key = `scroll_${pathname}`;
  const restoredRef = useRef(false);

  // Restore scroll on mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const saved = sessionStorage.getItem(key);
    if (!saved) return;

    const scrollVal = parseInt(saved, 10);
    if (isNaN(scrollVal)) return;

    // Try .dash-main first, fallback to window
    const tryRestore = (attempts = 0) => {
      const main = document.querySelector('.dash-main');
      if (main) {
        main.scrollTop = scrollVal;
      } else {
        window.scrollTo(0, scrollVal);
      }
      // Retry a couple times to handle async renders
      if (attempts < 3) {
        setTimeout(() => tryRestore(attempts + 1), 80);
      } else {
        sessionStorage.removeItem(key);
      }
    };

    setTimeout(() => tryRestore(), 60);
  }, []);

  // Save scroll on unmount
  useEffect(() => {
    return () => {
      const main = document.querySelector('.dash-main');
      const scrollVal = main ? main.scrollTop : window.scrollY;
      if (scrollVal > 0) {
        sessionStorage.setItem(key, String(scrollVal));
      } else {
        sessionStorage.removeItem(key);
      }
    };
  }, [key]);
}
