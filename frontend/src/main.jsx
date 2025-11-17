import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SocketProvider } from './contexts/SocketContext';
import './styles/App.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SocketProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SocketProvider>
  </React.StrictMode>
);