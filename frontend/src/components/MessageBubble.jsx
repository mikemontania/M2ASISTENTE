import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import CodeBlock from './CodeBlock';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
});

// Split text into segments: markdown text and fenced code blocks
const splitIntoSegments = (text = '') => {
  const segments = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const idx = match.index;
    if (idx > lastIndex) {
      segments.push({ type: 'md', content: text.slice(lastIndex, idx) });
    }
    segments.push({ type: 'code', lang: match[1] || '', content: match[2] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'md', content: text.slice(lastIndex) });
  }
  return segments;
};

export default function MessageBubble({ message }) {
  const isUser = message.rol === 'user' || message.rol === 'usuario';
  const isStreaming = message.streaming;

  const segments = splitIntoSegments(message.contenido || '');

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'} ${isStreaming ? 'streaming' : ''}`}>
      <div className="message-header">
        <strong>{isUser ? '👤 Tú' : '🤖 Asistente'}</strong>
        {message.marcaDeTiempo && (
          <span className="timestamp">
            {new Date(message.marcaDeTiempo).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="message-content">
        {segments.map((seg, i) => {
          if (seg.type === 'code') {
            return (
              <div key={i} style={{ margin: '12px 0' }}>
                <CodeBlock code={seg.content} language={seg.lang} />
              </div>
            );
          } else {
            // render markdown part
            const html = md.render(seg.content || '');
            return <div key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          }
        })}
      </div>
    </div>
  );
}