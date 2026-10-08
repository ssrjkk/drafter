import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { migrateLegacyStorage } from './lib/legacyMigration'
import { initI18n } from './lib/i18n'

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in DOM');

const root = ReactDOM.createRoot(rootEl);

// Without this call every component rendered `messages.en`: the entire ru/uk
// catalogue (~300 keys each) was dead code and `document.documentElement.lang`
// stayed "en".
initI18n();

function render() {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

// Runs before the database and key vault are opened so the renamed storage
// identifiers never hide an existing install's data. Never blocks startup.
migrateLegacyStorage().then(render, render);
