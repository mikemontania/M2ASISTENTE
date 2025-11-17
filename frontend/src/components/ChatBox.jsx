import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { agregarMensaje } from '../api/conversaciones.api';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import FileUpload from './FileUpload';
import '../styles/ChatBox.css';

export default function ChatBox({ conversationId, onConversationCreated, initialMessages = [] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false); // true while streaming or assistant assembling
  const [thinking, setThinking] = useState(false); // true while waiting for first chunk / "pensando..."
  const [attachedFiles, setAttachedFiles] = useState([]);
  const socket = useSocket();
  const messagesEndRef = useRef(null);
  const thinkingTimerRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, thinking]);

  // Update messages when conversation changes
  useEffect(() => {
    setMessages(initialMessages || []);
  }, [conversationId, initialMessages]);

  // Socket listeners for streaming & completion
  useEffect(() => {
    if (!socket) return;

    const onChatStream = (payload) => {
      // When stream arrives, cancel thinking indicator
      if (thinkingTimerRef.current) {
        clearTimeout(thinkingTimerRef.current);
        thinkingTimerRef.current = null;
      }
      setThinking(false);
      setIsTyping(true);

      if (payload.chunk) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          // If last is an assistant streaming message, append chunk
          if (last && last.rol === 'asistente' && last.streaming) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, contenido: last.contenido + payload.chunk };
            return updated;
          }
          // Otherwise push a new assistant streaming message
          return [...prev, { id: `streaming-${Date.now()}`, rol: 'asistente', contenido: payload.chunk, streaming: true }];
        });
      }

      if (payload.done) {
        setIsTyping(false);
        setMessages(prev => prev.map(m => (m.streaming ? { ...m, streaming: false } : m)));
      }
    };

    const onMensajeCompletado = (payload) => {
      // Completed final message saved in DB
      setThinking(false);
      setIsTyping(false);

      if (!payload?.mensaje) return;
      setMessages(prev => {
        // remove streaming placeholders and append persisted mensaje
        const withoutStreaming = prev.filter(m => !m.streaming);
        return [...withoutStreaming, {
          id: payload.mensaje.id,
          rol: payload.mensaje.rol,
          contenido: payload.mensaje.contenido,
          marcaDeTiempo: payload.mensaje.marcaDeTiempo
        }];
      });
    };

    const onErrorChat = (payload) => {
      setThinking(false);
      setIsTyping(false);
      alert(`Error during chat: ${payload?.error || 'unknown error'}`);
    };

    socket.on('chat_stream', onChatStream);
    socket.on('mensaje_completado', onMensajeCompletado);
    socket.on('error_chat', onErrorChat);

    return () => {
      socket.off('chat_stream', onChatStream);
      socket.off('mensaje_completado', onMensajeCompletado);
      socket.off('error_chat', onErrorChat);
    };
  }, [socket, thinking]);

 // Inserta/replace en tu ChatBox: la lógica de subida dentro de handleSend
const handleSend = async (e) => {
  e?.preventDefault();
  if (!input.trim() || sending) return;

  // Prevent send while files are uploading
  const haveUploading = attachedFiles.some(f => f.uploading === true || f.uploading === 'true');
  if (haveUploading) {
    alert('Aún se están subiendo archivos. Espera a que terminen antes de enviar.');
    return;
  }

  setSending(true);
  setThinking(true);
  setIsTyping(false);
  thinkingTimerRef.current = setTimeout(() => { thinkingTimerRef.current = null; }, 3000);

  // Add user's message to UI
  const tempMessage = { id: `temp-${Date.now()}`, rol: 'user', contenido: input, temporal: true };
  setMessages(prev => [...prev, tempMessage]);

  try {
    let finalConvId = conversationId;
    if (!finalConvId) {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + '/conversaciones/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: 'Nueva conversación' })
      });
      const conv = await res.json();
      finalConvId = conv.id;
      if (onConversationCreated) onConversationCreated(finalConvId);
    }

    // DEBUG: ver qué archivos vamos a enviar
    console.log('Attached files before send:', attachedFiles);

    // Build attachments metadata: prefer records with id (already uploaded)
    const attachedMeta = [];
    for (const f of attachedFiles) {
      if (f.id) {
        // already persisted by FileUpload
        attachedMeta.push({ id: f.id, nombreArchivo: f.nombreArchivo || f.name, rutaArchivo: f.rutaArchivo || '' });
      } else if (f.file) {
        // fallback: upload now (should be rare if FileUpload auto-uploads)
        const form = new FormData();
        form.append('file', f.file);
        form.append('conversacionId', finalConvId);
        const uploadRes = await fetch((import.meta.env.VITE_API_URL || '') + '/uploads', { method: 'POST', body: form });
        const json = await uploadRes.json();
        if (json?.archivo) attachedMeta.push(json.archivo);
      }
    }

    // Enviar mensaje a backend para que haga streaming
    const socketId = socket?.id;
    await agregarMensaje(
      {
        conversacionId: finalConvId,
        rol: 'user',
        contenido: input,
        archivosAdjuntos: attachedMeta
      },
      true,
      socketId
    );

    // limpiar archivos adjuntos del estado de la UI
    setAttachedFiles([]);
  } catch (error) {
    console.error('Error sending message:', error);
    alert('Ocurrió un error al enviar el mensaje.');
    setMessages(prev => prev.filter(m => !m.temporal));
    setThinking(false);
    setIsTyping(false);
  } finally {
    setInput('');
    setSending(false);
  }
};

  return (
    <div className="chatbox">
      <div className="chatbox-header">
        <h2>Asistente IA</h2>
      </div>

      <div className="chatbox-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <h2>👋 ¡Hola!</h2>
            <p>Soy tu asistente de IA. ¿En qué puedo ayudarte hoy?</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble key={msg.id || idx} message={msg} />
        ))}

        {/* If thinking but no stream yet show a clear "Pensando..." */}
        {thinking && !isTyping && (
          <div style={{ alignSelf: 'flex-start', margin: '6px 0', color: '#6b7280', fontStyle: 'italic' }}>
            🤔 Pensando...
          </div>
        )}

        {/* Typing indicator when streaming */}
        {isTyping && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      <FileUpload
        files={attachedFiles}
        onChange={setAttachedFiles}
      />

      <form className="chatbox-input" onSubmit={handleSend}>
        <textarea
          placeholder="Escribe tu mensaje... (Shift+Enter para nueva línea)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          disabled={sending}
          rows={1}
        />
        <button type="submit" disabled={sending || !input.trim()}>
          {sending ? '⏳' : '📤'} Enviar
        </button>
      </form>
    </div>
  );
}