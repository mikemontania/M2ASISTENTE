// reemplaza tu archivo actual por este (añadí debug controlado por DEBUG_CHAT)
const Conversacion = require('../models/conversacion.model');
const Mensaje = require('../models/mensaje.model');
const ArchivoAdjunto = require('../models/archivoAdjunto.model');
const { chatWithOllama } = require('../services/ia.service');
const socketService = require('../services/socket.service');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../services/uploads.service');

const normalizarRol = (rol) => {
  const roles = { 'user': 'usuario', 'usuario': 'usuario', 'assistant': 'asistente', 'asistente': 'asistente' };
  return roles[rol] || rol;
};

const MAX_CHARS_PER_FILE = 15000; // ajustar según tus pruebas
const MAX_FILES_TO_ATTACH = 5;
const DEBUG_TRUNCATE = 8000;

const truncate = (s, n = DEBUG_TRUNCATE) => {
  if (typeof s !== 'string') return s;
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n\n...[TRUNCADO ${s.length - n} chars]...`;
};

const crearConversacion = async (req, res, next) => {
  try {
    const { titulo } = req.body;
    const conversacion = await Conversacion.create({ titulo: titulo || 'Nueva conversación' });
    res.json(conversacion);
  } catch (err) {
    next(err);
  }
};

const listarConversaciones = async (req, res, next) => {
  try {
    const conversaciones = await Conversacion.findAll({
      order: [['updatedAt', 'DESC']],
      include: [{ model: Mensaje, limit: 1, order: [['marcaDeTiempo', 'DESC']] }]
    });
    res.json(conversaciones);
  } catch (err) {
    next(err);
  }
};

const obtenerConversacion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const conversacion = await Conversacion.findByPk(id, {
      include: [{ model: Mensaje, order: [['marcaDeTiempo', 'ASC']] }]
    });
    if (!conversacion) return res.status(404).json({ error: 'Conversación no encontrada' });
    res.json(conversacion);
  } catch (err) {
    next(err);
  }
};

const agregarMensaje = async (req, res, next) => {
  try {
    const { conversacionId, rol, contenido, archivosAdjuntos } = req.body;
    const { stream, socketId } = req.query;
    const rolNormalizado = normalizarRol(rol);

    // Guardar mensaje del usuario en BD (siempre guardar lo que el usuario envía)
    const mensajeUsuario = await Mensaje.create({
      conversacionId,
      rol: rolNormalizado,
      contenido,
      archivosAdjuntos: archivosAdjuntos || []
    });

    if (rolNormalizado !== 'usuario') {
      return res.json({ ok: true, mensaje: mensajeUsuario });
    }

    // Obtener historial
    const mensajesAnteriores = await Mensaje.findAll({
      where: { conversacionId },
      order: [['marcaDeTiempo', 'ASC']],
      limit: 30
    });
    const mensajesFormateados = mensajesAnteriores.map(m => ({ rol: m.rol, contenido: m.contenido }));

    // Manejo robusto de archivosAdjuntos: aceptamos ids o objetos
    const adj = Array.isArray(archivosAdjuntos) ? archivosAdjuntos : [];
    const resolvedAdjuntos = []; // guardará objetos ArchivoAdjunto persistidos

    for (const item of adj) {
      if (!item) continue;
      // caso 1: item es id (string/number)
      if (typeof item === 'string' || typeof item === 'number') {
        const found = await ArchivoAdjunto.findByPk(item);
        if (found) resolvedAdjuntos.push(found);
        continue;
      }

      // caso 2: item es objeto con id
      if (item.id) {
        const found = await ArchivoAdjunto.findByPk(item.id);
        if (found) { resolvedAdjuntos.push(found); continue; }
      }

      // caso 3: item es objeto con rutaArchivo o nombre (buscar por ruta o nombre)
      let foundByPath = null;
      if (item.rutaArchivo) {
        foundByPath = await ArchivoAdjunto.findOne({ where: { rutaArchivo: item.rutaArchivo } });
      }
      if (foundByPath) {
        resolvedAdjuntos.push(foundByPath);
        continue;
      }

      // caso 4: si no lo encontramos pero recibimos ruta/nombre, creamos un registro mínimo
      if (item.rutaArchivo || item.nombreArchivo) {
        try {
          const creado = await ArchivoAdjunto.create({
            conversacionId: item.conversacionId || conversacionId || null,
            nombreArchivo: item.nombreArchivo || (item.rutaArchivo ? require('path').basename(item.rutaArchivo) : 'adjunto'),
            rutaArchivo: item.rutaArchivo || '',
            mimeType: item.mimeType || null,
            contenidoExtraido: item.contenidoExtraido || null
          });
          resolvedAdjuntos.push(creado);
        } catch (e) {
          // fallback: registro fallido, ignorar pero loguear
          if (process.env.DEBUG_CHAT === 'true') console.warn('[DEBUG] No se pudo crear ArchivoAdjunto temporal:', e.message);
        }
      }
    }

    // Ahora resolvedAdjuntos contiene registros persistidos encontrados o recién creados
    // Generar mensajes de contexto con extractos
    const attachmentMessages = [];
    const attachmentsDebug = [];
    for (const a of resolvedAdjuntos.slice(0, MAX_FILES_TO_ATTACH)) {
      // leer contenido similar a antes (preferir contenidoExtraido)
      let textContent = null;
      if (a.contenidoExtraido) {
        textContent = a.contenidoExtraido;
      } else if (a.rutaArchivo) {
        try {
          const safe = require('path').resolve(a.rutaArchivo);
          if (process.env.UPLOADS_DIR) {
            const base = require('path').resolve(process.env.UPLOADS_DIR);
            if (safe.startsWith(base)) {
              textContent = require('fs').readFileSync(safe, 'utf8');
            } else {
              textContent = `[No se leyó el archivo por seguridad: ${a.nombreArchivo}]`;
            }
          } else {
            textContent = require('fs').readFileSync(safe, 'utf8');
          }
        } catch (e) {
          textContent = `[No se pudo leer el archivo: ${a.nombreArchivo}]`;
        }
      } else {
        textContent = `[Adjunto sin ruta ni contenido extraído: ${a.nombreArchivo}]`;
      }

      let snippet = typeof textContent === 'string' ? (textContent.length > MAX_CHARS_PER_FILE ? textContent.slice(0, MAX_CHARS_PER_FILE) + '\n\n...[TRUNCADO]...' : textContent) : String(textContent);

      attachmentMessages.push({
        rol: 'system',
        contenido: `Archivo adjunto: ${a.nombreArchivo}\nTipo: ${a.mimeType || 'desconocido'}\nContenido (o extracto):\n${snippet}`
      });

      attachmentsDebug.push({ id: a.id, nombreArchivo: a.nombreArchivo, extracto: snippet.slice(0, 1200) });
    }

    const finalMessagesForModel = [...attachmentMessages, ...mensajesFormateados];

    // debug emit/log
    const debugPayload = {
      conversationId: conversacionId,
      preparedMessagesCount: finalMessagesForModel.length,
      attachments: attachmentsDebug,
      exampleMessagePreview: finalMessagesForModel.slice(0,6).map(m => ({ rol: m.rol, contenido: (m.contenido || '').slice(0,400) }))
    };
    if (process.env.DEBUG_CHAT === 'true') console.log('[DEBUG][conversaciones.controller] prepared payload:', JSON.stringify(debugPayload, null, 2));
    if (socketId && process.env.DEBUG_CHAT === 'true') {
      try { require('../services/socket.service').emitToSocket(socketId, 'debug_prepared_payload', debugPayload); } catch(e){}
    }

    const useStream = stream === 'true' || stream === true;
    if (useStream && socketId) {
      res.json({ ok: true, mensaje: mensajeUsuario, streaming: true });
      // iniciar chat con Ollama asíncrono
      chatWithOllama({ mensajes: finalMessagesForModel, stream: true, socketId })
        .then(async (resp) => {
          const mensajeIA = await Mensaje.create({ conversacionId, rol: 'asistente', contenido: resp.content });
          require('../services/socket.service').emitToSocket(socketId, 'mensaje_completado', { mensaje: mensajeIA });
        })
        .catch((err) => {
          require('../services/socket.service').emitToSocket(socketId, 'error_chat', { error: err.message });
        });
    } else {
      const resp = await chatWithOllama({ mensajes: finalMessagesForModel, stream: false });
      const mensajeIA = await Mensaje.create({ conversacionId, rol: 'asistente', contenido: resp.content });
      res.json({ ok: true, mensajeUsuario, mensajeIA });
    }
  } catch (err) {
    next(err);
  }
};

module.exports = { crearConversacion, listarConversaciones, obtenerConversacion, agregarMensaje };