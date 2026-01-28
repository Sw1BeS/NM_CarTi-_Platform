
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Handle Telegram WebApp hash URLs (/#/p/...) for BrowserRouter deployments.
const hash = window.location.hash || '';
if (hash.startsWith('#/p/')) {
  const trimmed = hash.slice(1); // remove leading '#'
  const [path, query] = trimmed.split('?');
  const nextUrl = `${window.location.origin}${path}${query ? `?${query}` : ''}`;
  if (window.location.pathname === '/' && window.location.hash) {
    window.location.replace(nextUrl);
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// Removed StrictMode to ensure Singleton pattern for Workers (prevents polling conflicts)
root.render(
    <App />
);
