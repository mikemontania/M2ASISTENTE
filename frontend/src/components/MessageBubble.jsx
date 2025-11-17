import React from 'react';
import MarkdownIt from 'markdown-it';
import CodeBlock from './CodeBlock';
import { FiUser, FiCpu } from 'react-icons/fi';
import 'highlight.js/styles/github-dark.css';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
});

/**
 * Separa un texto en segmentos de Markdown y bloques de código.
 * Robusto ante backticks internos dentro de los bloques de código.
 */
const splitIntoSegments = (text = '') => {
  const segments = [];
  const regex = /^```(\w+)?\n([\s\S]*?)^```$/gm; // busca solo ``` al inicio de línea
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const idx = match.index;
    if (idx > lastIndex) {
      segments.push({ type: 'md', content: text.slice(lastIndex, idx) });
    }
    // **No reemplazamos nada antes**, el contenido queda crudo
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

  // No reemplazamos \n globalmente antes del split, solo lo hacemos en cada segmento
  const rawContent = message.contenido || '';
  const segments = splitIntoSegments(rawContent);

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'} ${isStreaming ? 'streaming' : ''}`}>
      <div className="message-header">
        <strong>
          {isUser ? <><FiUser size={16} /> Tú</> : <><FiCpu size={16} /> Asistente</>}
        </strong>
        {message.marcaDeTiempo && (
          <span className="timestamp">
            {new Date(message.marcaDeTiempo).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
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
            // Reemplazamos \n literales en el Markdown
           const html = md.render(seg.content.replace(/\\n/g, '\n'));

            return <div key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          }
        })}
      </div>
    </div>
  );
}
