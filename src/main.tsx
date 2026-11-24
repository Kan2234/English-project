import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { DataProvider } from './lib/data';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* HashRouter: works on any static host without rewrite rules */}
      <HashRouter>
        <DataProvider>
          <App />
        </DataProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
);
