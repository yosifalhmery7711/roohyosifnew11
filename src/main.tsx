import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Bulletproof Global Fetch Interceptor to ensure Vercel deployments bypass routing redirects or proxy latency
try {
  const originalFetch = window.fetch;
  const isWritable = (() => {
    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
      return !desc || desc.writable || !!desc.set || desc.configurable;
    } catch {
      return true;
    }
  })();

  if (isWritable) {
    const patchedFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      let url = "";
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input && typeof input === 'object' && 'url' in input) {
        url = (input as any).url;
      }

      let parsedUrl: URL | null = null;
      try {
        parsedUrl = new URL(url, window.location.href);
      } catch (e) {}

      const isRelativeApi = !!(parsedUrl && 
                            (parsedUrl.pathname.startsWith('/api/') || parsedUrl.pathname.startsWith('/aa/')) &&
                            (parsedUrl.origin === window.location.origin || parsedUrl.origin === 'null'));

      if (isRelativeApi && parsedUrl) {
        // Detect if we are hosted on an external client runner like Vercel
        const isVercel = window.location.hostname.includes('vercel.app') || 
                         (!window.location.hostname.includes('localhost') && 
                          !window.location.hostname.includes('127.0.0.1') && 
                          !window.location.hostname.includes('.run.app'));

        const envBackend = (import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/$/, "");
        const primaryBackend = envBackend || 'https://ais-pre-7wda5scnznd4bea77v3tw4-365000381785.europe-west1.run.app';
        const fallbackBackend = 'https://ais-dev-7wda5scnznd4bea77v3tw4-365000381785.europe-west1.run.app';

        if (isVercel) {
          // A. Try Primary (Custom or ais-pre) Backend URL
          try {
            const absoluteUrlPre = `${primaryBackend}${parsedUrl.pathname}${parsedUrl.search}`;
            let requestToUse: RequestInfo = absoluteUrlPre;
            if (input instanceof Request) {
              requestToUse = new Request(absoluteUrlPre, input);
            }
            const response = await originalFetch(requestToUse, init);
            if (response.status !== 404 && response.status !== 502 && response.status !== 503) {
              return response;
            }
          } catch (err) {
            console.warn(`Fetch to primary backend failed on Vercel:`, err);
          }

          // B. Try Fallback (ais-dev) Backend URL
          if (primaryBackend !== fallbackBackend) {
            try {
              const absoluteUrlDev = `${fallbackBackend}${parsedUrl.pathname}${parsedUrl.search}`;
              let requestToUse: RequestInfo = absoluteUrlDev;
              if (input instanceof Request) {
                requestToUse = new Request(absoluteUrlDev, input);
              }
              const response = await originalFetch(requestToUse, init);
              if (response.status !== 404 && response.status !== 502 && response.status !== 503) {
                return response;
              }
            } catch (err) {
              console.warn(`Fetch to fallback backend failed on Vercel:`, err);
            }
          }
        } else {
          // Normal environment or emulator: try relative first, fallback on 404 or network disconnect
          const absoluteUrl = `${primaryBackend}${parsedUrl.pathname}${parsedUrl.search}`;
          try {
            const response = await originalFetch(input, init);
            if (response.status === 404) {
              const isOnCloudRun = window.location.hostname.includes('.run.app');
              if (isOnCloudRun) {
                return response;
              }
              let requestToUse: RequestInfo = absoluteUrl;
              if (input instanceof Request) {
                requestToUse = new Request(absoluteUrl, input);
              }
              return await originalFetch(requestToUse, init);
            }
            return response;
          } catch (err) {
            const isOnCloudRun = window.location.hostname.includes('.run.app');
            if (isOnCloudRun) {
              throw err;
            }
            let requestToUse: RequestInfo = absoluteUrl;
            if (input instanceof Request) {
              requestToUse = new Request(absoluteUrl, input);
            }
            return await originalFetch(requestToUse, init);
          }
        }
      }

      return originalFetch(input, init);
    };

    try {
      Object.defineProperty(window, 'fetch', {
        value: patchedFetch,
        writable: true,
        configurable: true
      });
    } catch {
      window.fetch = patchedFetch;
    }
  } else {
    console.warn("window.fetch is read-only on this platform. Bypassing global patch.");
  }
} catch (globalInterceptError) {
  console.warn("Could not patch window.fetch globally due to runtime environment restrictions:", globalInterceptError);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

