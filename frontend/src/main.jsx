import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './context';
import App from './App';
import './styles.css';
import '@fontsource-variable/nunito';
createRoot(document.getElementById('root')).render(
  <AppProvider>
    <App />
  </AppProvider>
);
