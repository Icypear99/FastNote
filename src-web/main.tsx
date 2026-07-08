import React from 'react';
import ReactDOM from 'react-dom/client';
import './shared/styles/base.css';
import './shared/styles/layout.css';
import './shared/styles/components.css';
import './shared/styles/pages.css';
import App from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
