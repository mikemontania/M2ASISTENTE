export default function ConversationItem({ conversation, isActive, onClick }) {
  const title = conversation.titulo || 'Sin título';
  const last = (conversation.Mensajes && conversation.Mensajes[0]) || (conversation.mensajes && conversation.mensajes[0]) || null;
  const preview = last ? (last.contenido || '').slice(0, 80) : '...';
  return (
    <div className={`conversation-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="conv-title">{title}</div>
      <div className="conv-preview">{preview}</div>
    </div>
  );
}