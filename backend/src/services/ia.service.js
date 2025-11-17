// reemplaza tu ia.service.js por este: logs controlados por DEBUG_CHAT y emisión debug_model_payload
const socketService = require('./socket.service');

const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const model = process.env.OLLAMA_MODEL || 'llama3.2';

const mapRole = (r) => {
  if (!r) return 'user';
  const rl = r.toLowerCase();
  if (rl === 'usuario' || rl === 'user') return 'user';
  if (rl === 'asistente' || rl === 'assistant') return 'assistant';
  return 'system';
};

const safeTruncate = (s, n = 1000) => {
  if (typeof s !== 'string') return s;
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n\n...[TRUNCADO ${s.length - n} chars]...`;
};

const chatWithOllama = async ({ mensajes, stream = false, socketId = null, timeoutMs = 180000 }) => {
  const url = `${ollamaUrl}/api/chat`;

  const messages = mensajes.map(m => ({
    role: mapRole(m.rol),
    content: m.contenido
  }));

  const body = { model, messages, stream };

  // DEBUG: mostrar y emitir lo que enviaremos exactamente a Ollama
  if (process.env.DEBUG_CHAT === 'true') {
    try {
      console.log('[DEBUG][ia.service] Enviando a Ollama:', {
        url,
        model,
        stream,
        totalMessages: messages.length,
        messagesPreview: messages.slice(0, 10).map(m => ({ role: m.role, content: safeTruncate(m.content, 500) }))
      });
    } catch (e) {
      console.warn('[DEBUG] log falló:', e.message);
    }
  }

  if (socketId && process.env.DEBUG_CHAT === 'true') {
    try {
      socketService.emitToSocket(socketId, 'debug_model_payload', {
        url,
        model,
        stream,
        totalMessages: messages.length,
        messagesPreview: messages.slice(0, 6).map(m => ({ role: m.role, content: safeTruncate(m.content, 500) }))
      });
    } catch (e) {
      console.warn('[DEBUG] emit debug_model_payload failed:', e.message);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ollama error: ${res.status} - ${errorText}`);
    }

    if (!stream) {
      const json = await res.json();
      return { content: json.message?.content || '', raw: json };
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            const content = json.message?.content || '';

            if (content) {
              fullContent += content;
              if (socketId) {
                socketService.emitToSocket(socketId, 'chat_stream', { chunk: content, done: json.done || false });
              }
            }
          } catch (e) {
            // fallback raw chunk
            fullContent += line;
            if (socketId) {
              socketService.emitToSocket(socketId, 'chat_stream', { chunk: line, done: false });
            }
          }
        }
      }

      return { content: fullContent, raw: null };
    }
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
};

module.exports = { chatWithOllama };