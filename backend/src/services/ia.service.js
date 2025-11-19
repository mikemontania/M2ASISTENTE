// services/ia.service.js
const socketService = require('./socket.service');
const fetch = global.fetch || require('node-fetch');

const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const defaultModel = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

// Control simple de concurrencia
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
 *  - mensajes: [{rol, contenido, attachmentImages?}, ...]
 *  - stream: boolean
 *  - socketId: string (opcional)
 *  - timeoutMs: number
 *  - model: string (override)
 *  - hasImages: boolean (flag explícito)
 * @returns { content, raw, model }
 */
const chatWithOllama = async ({ 
  mensajes = [], 
  stream = false, 
  socketId = null, 
  timeoutMs = 180000, 
  model = null,
  hasImages = false 
}) => {
  await waitForFreeSlot();
  currentCalls++;

  const url = `${ollamaUrl}/api/chat`;
  const usedModel = model || defaultModel;

  // Construir mensajes con soporte para imágenes
  const messages = mensajes.map(m => {
    const msg = { 
      role: mapRole(m.rol), 
      content: m.contenido 
    };
    
    // Si el mensaje tiene imágenes adjuntas, agregar formato de Ollama
    if (m.attachmentImages && m.attachmentImages.length > 0) {
      // Ollama espera un array de strings base64 en el campo "images"
      msg.images = m.attachmentImages.map(img => {
        // Extraer solo el base64, sin el prefijo data:image
        return img.source.data;
      });
      
      console.log(`[INFO][ia.service] Mensaje con ${msg.images.length} imagen(es) para ${usedModel}`);
    }
    
    return msg;
  });

  const body = { 
    model: usedModel, 
    messages, 
    stream,
    options: {
      // Opciones específicas para modelos de visión
      ...(hasImages && {
        temperature: 0.7,
        num_predict: 2048
      })
    }
  };

  console.log('[INFO][ia.service] Request a Ollama:', {
    url, 
    model: usedModel, 
    stream, 
    totalMessages: messages.length,
    hasImages,
    imagesInLastMessage: messages[messages.length - 1]?.images?.length || 0
  });

  if (socketId) {
    try {
      socketService.emitToSocket(socketId, 'debug_model_payload', {
        url, 
        model: usedModel, 
        stream, 
        totalMessages: messages.length,
        hasImages,
        messagesPreview: messages.slice(0, 3).map(m => ({ 
          role: m.role, 
          content: safeTruncate(m.content, 500),
          hasImages: !!m.images
        }))
      });
    } catch (e) {
      console.warn('[WARN][ia.service] Socket emit failed:', e.message);
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
      console.error('[ERROR][ia.service] Ollama response:', {
        status: res.status,
        error: text
      });
      throw new Error(`Ollama error: ${res.status} - ${text}`);
    }

    if (!stream) {
      const json = await res.json();
      const content = json.message?.content || '';
      
      console.log('[INFO][ia.service] Response received:', {
        model: usedModel,
        contentLength: content.length,
        success: true
      });
      
      return { 
        content, 
        raw: json, 
        model: usedModel 
      };
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
              if (socketId) {
                socketService.emitToSocket(socketId, 'chat_stream', { 
                  chunk: content, 
                  done: json.done || false, 
                  model: usedModel 
                });
              }
            }
          } catch (e) {
            fullContent += line;
            if (socketId) {
              socketService.emitToSocket(socketId, 'chat_stream', { 
                chunk: line, 
                done: false, 
                model: usedModel 
              });
            }
          }
        }
      }

      console.log('[INFO][ia.service] Stream completed:', {
        model: usedModel,
        contentLength: fullContent.length
      });

      return { 
        content: fullContent, 
        raw: null, 
        model: usedModel 
      };
    }
  } catch (err) {
    clearTimeout(timeout);
    console.error('[ERROR][ia.service] Request failed:', {
      model: usedModel,
      error: err.message,
      hasImages
    });
    throw err;
  } finally {
    currentCalls = Math.max(0, currentCalls - 1);
  }
};

module.exports = { chatWithOllama };