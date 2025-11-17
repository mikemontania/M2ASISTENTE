import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ChatBox from '../components/ChatBox';
import { obtenerConversacion, crearConversacion } from '../api/conversaciones.api';
import '../styles/ChatBox.css';
import '../styles/Sidebar.css';

export default function ChatPage() {
  const { id } = useParams();
  const [currentConvId, setCurrentConvId] = useState(id || null);
  const [initialMessages, setInitialMessages] = useState([]);

  useEffect(() => {
    if (id) loadConversation(id);
    else setInitialMessages([]);
  }, [id]);

  const loadConversation = async (convId) => {
    try {
      const res = await obtenerConversacion(convId);
      setCurrentConvId(convId);
      setInitialMessages(res.data.Mensajes || res.data.mensajes || []);
    } catch (e) {
      console.error('No se pudo cargar conversación', e);
    }
  };

  const handleConversationCreated = (newId) => {
    setCurrentConvId(newId);
  };

  return (
    <div className="app-grid">
      <aside className="left-col">
        <Sidebar currentConvId={currentConvId} />
      </aside>
      <main className="main-col">
        <ChatBox
          conversationId={currentConvId}
          onConversationCreated={handleConversationCreated}
          initialMessages={initialMessages}
        />
      </main>
    </div>
  );
}