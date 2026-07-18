import React from 'react';
import ReactDOM from 'react-dom/client';
import {LayerProvider} from '@astryxdesign/core/Layer';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './shared/styles/base.css';
import './shared/styles/layout.css';
import './shared/styles/components.css';
import './shared/styles/pages.css';
import App from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LayerProvider toast={{position: 'topEnd', maxVisible: 4}}>
      <App />
    </LayerProvider>
  </React.StrictMode>,
);
