import { useState, useEffect } from 'react';
import hljs from 'highlight.js';
import { FiCopy, FiCheck, FiDownload } from 'react-icons/fi';
import 'highlight.js/styles/github.css';
import '../styles/CodeBlock.css';

export default function CodeBlock({ code = '', language = '' }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // highlight.js will act on rendered <pre><code>
    hljs.highlightAll();
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ext = language ? `.${language}` : '.txt';
    a.href = url;
    a.download = `snippet${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <div className="code-lang">{language || 'text'}</div>
        <div className="code-actions">
          <button className="code-btn" onClick={handleCopy} title="Copiar código">
            {copied ? (<><FiCheck /> <span className="btn-text">Copiado</span></>) : (<><FiCopy /> <span className="btn-text">Copiar</span></>)}
          </button>
          <button className="code-btn ghost" onClick={handleDownload} title="Descargar archivo">
            <FiDownload /> <span className="btn-text">Descargar</span>
          </button>
        </div>
      </div>

      <div className="code-block-body" role="region" aria-label={`Code block ${language || 'code'}`}>
        <pre>
          <code className={language ? `language-${language}` : ''}>{code}</code>
        </pre>
      </div>
    </div>
  );
}