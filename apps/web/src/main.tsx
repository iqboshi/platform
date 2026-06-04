import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { appRouterBasename } from './config/env';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={appRouterBasename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
