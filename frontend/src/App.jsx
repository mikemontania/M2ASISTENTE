import { Routes, Route, Navigate } from 'react-router-dom';
import ChatPage from './pages/ChatPage';
import './styles/App.css';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/chat/:id" element={<ChatPage />} />
    </Routes>
  );
}