// The /picks page: its own small entry (vite.pages.config.ts), so it never
// loads the app or its catalog.
import '../telemetry';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Picks } from './Picks';
import './picks.css';

createRoot(document.getElementById('picks')!).render(
  <StrictMode>
    <Picks />
  </StrictMode>,
);
