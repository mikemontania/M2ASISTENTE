// services/ia.service.js
// Llamadas a Ollama con override de modelo, semáforo de concurrencia, y debug emitido por socket.
const socketService = require('./socket.service');
const fetch = global.fetch || require('node-fetch'); // si Node >=18 no hace falta

const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const defaultModel = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

// Control simple de concurrencia para no saturar CPU
const MAX_CONCURRENT_MODEL_CALLS = parseInt(process.env.MAX_MODEL_CONCURRENCY || '1', 10);
let currentCalls = 0;
const waitForFreeSlot = () => new Promise((resolve) => {
  const iv = setInterval(() => {
    if (currentCalls < MAX_CONCURRENT_MODEL_CALLS) {
      clearInterval(iv);
      resolve();
    }
  }, 100);
});

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

/**
 * chatWithOllama
 * @param {Object} opts
 *  - mensajes: [{rol, contenido}, ...]
 *  - stream: boolean
 *  - socketId: string (opcional) para emitir via socket
 *  - timeoutMs: number
 *  - model: string (override, e.g. 'qwen2.5-coder:7b')
 * @returns { content, raw, model }
 */
const chatWithOllama = async ({ mensajes = [], stream = false, socketId = null, timeoutMs = 180000, model = null }) => {
  await waitForFreeSlot();
  currentCalls++;

  const url = `${ollamaUrl}/api/chat`;
  const usedModel = model || defaultModel;

  const messages = mensajes.map(m => ({ role: mapRole(m.rol), content: m.contenido }));
  const body = { model: usedModel, messages, stream };

  if (process.env.DEBUG_CHAT === 'true') {
    try {
      console.log('[DEBUG][ia.service] Enviando a Ollama:', {
        url, usedModel, stream, totalMessages: messages.length,
        messagesPreview: messages.slice(0, 8).map(m => ({ role: m.role, content: safeTruncate(m.content, 500) }))
      });
      if (socketId) {
        socketService.emitToSocket(socketId, 'debug_model_payload', {
          url, usedModel, stream, totalMessages: messages.length,
          messagesPreview: messages.slice(0, 6).map(m => ({ role: m.role, content: safeTruncate(m.content, 500) }))
        });
      }
    } catch (e) {
      console.warn('[DEBUG][ia.service] log failed:', e.message);
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
      const text = await res.text();
      throw new Error(`Ollama error: ${res.status} - ${text}`);
    }

    if (!stream) {
      const json = await res.json();
      return { content: json.message?.content || '', raw: json, model: usedModel };
    } else {
      // streaming
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            const content = json.message?.content || '';
            if (content) {
              fullContent += content;
              if (socketId) socketService.emitToSocket(socketId, 'chat_stream', { chunk: content, done: json.done || false, model: usedModel });
            }
          } catch (e) {
            fullContent += line;
            if (socketId) socketService.emitToSocket(socketId, 'chat_stream', { chunk: line, done: false, model: usedModel });
          }
        }
      }

      return { content: fullContent, raw: null, model: usedModel };
    }
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  } finally {
    currentCalls = Math.max(0, currentCalls - 1);
  }
};

module.exports = { chatWithOllama };
