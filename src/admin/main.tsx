import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './admin.css';

createRoot(document.getElementById('admin')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
