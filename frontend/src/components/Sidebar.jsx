import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarConversaciones, crearConversacion } from '../api/conversaciones.api';
import ConversationItem from './ConversationItem';

export default function Sidebar({ currentConvId }) {
  const [conversaciones, setConversaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    load();
    // simple polling to keep list in sync
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await listarConversaciones();
      setConversaciones(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNew = async () => {
    try {
      const res = await crearConversacion('Nueva conversación');
      navigate(`/chat/${res.data.id}`);
      setTimeout(load, 200);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Conversaciones</h3>
        <button onClick={handleNew} className="new-btn">➕</button>
      </div>
      <div className="sidebar-list">
        {loading && <div className="loading">Cargando...</div>}
        {!loading && conversaciones.length === 0 && <div className="empty">Sin conversaciones</div>}
        {!loading && conversaciones.map(c => (
          <ConversationItem
            key={c.id}
            conversation={c}
            isActive={c.id === currentConvId}
            onClick={() => navigate(`/chat/${c.id}`)}
          />
        ))}
      </div>
    </div>
  );
}