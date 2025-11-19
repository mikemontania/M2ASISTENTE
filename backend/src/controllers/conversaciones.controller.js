// controllers/conversaciones.controller.js
const Conversacion = require('../models/conversacion.model');
const Mensaje = require('../models/mensaje.model');
const ArchivoAdjunto = require('../models/archivoAdjunto.model');
const { chatWithOllama } = require('../services/ia.service');
const { chooseModelForMessages, executeWorkflow } = require('../services/modelOrchestrator.service');
const socketService = require('../services/socket.service');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../services/uploads.service');

const MAX_CHARS_PER_FILE = 15000;
const MAX_FILES_TO_ATTACH = 25;
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

function normalizarRol(rol) {
  if (!rol) return "usuario";
  const r = rol.toLowerCase();
  if (r === "user" || r === "usuario") return "usuario";
  if (r === "assistant" || r === "asistente") return "asistente";
  if (r === "system" || r === "sistema") return "system";
  return "usuario";
}

const agregarMensaje = async (req, res, next) => {
  try {
    const { conversacionId, rol, contenido, archivosAdjuntos } = req.body;
    const { stream, socketId } = req.query;

    const rolNormalizado = normalizarRol(rol);

// ------------------------------------------------------
    // 1) Verificar existencia previa de cada archivo adjunto
    // ------------------------------------------------------
    for (const item of archivosAdjuntos || []) {
      let id = typeof item === "object" ? item.id : item;
      if (!id) continue;
      const existe = await ArchivoAdjunto.findByPk(id);
      if (!existe) {
        return res.status(409).json({ error: "Archivo adjunto aún no está listo. Reintentar.", archivoId: id });
      }
    }

    // 2) Historial anterior (30 mensajes más recientes)
    let mensajesAnteriores = await Mensaje.findAll({
      where: { conversacionId },
      order: [["marcaDeTiempo", "DESC"]],
      limit: 30,
    });
    mensajesAnteriores = mensajesAnteriores.reverse();
    const mensajesFormateados = mensajesAnteriores.map((m) => ({ rol: m.rol, contenido: m.contenido }));

    // 3) Resolver adjuntos (evitar duplicados y crear si falta)
    const adj = Array.isArray(archivosAdjuntos) ? archivosAdjuntos : [];
    const ids = new Set();
    const resolvedAdjuntos = [];

    for (const item of adj) {
      if (!item) continue;
      let found = null;
      if (typeof item === "number" || typeof item === "string") {
        found = await ArchivoAdjunto.findByPk(item);
      } else if (item.id) {
        found = await ArchivoAdjunto.findByPk(item.id);
      } else if (item.rutaArchivo) {
        found = await ArchivoAdjunto.findOne({ where: { rutaArchivo: item.rutaArchivo } });
      }

      if (found) {
        if (!ids.has(found.id)) {
          ids.add(found.id);
          resolvedAdjuntos.push(found);
        }
        continue;
      }

      if (!found && (item.rutaArchivo || item.nombreArchivo)) {
        const creado = await ArchivoAdjunto.create({
          conversacionId,
          nombreArchivo: item.nombreArchivo || path.basename(item.rutaArchivo || "archivo"),
          rutaArchivo: item.rutaArchivo || "",
          mimeType: item.mimeType || null,
          contenidoExtraido: item.contenidoExtraido || null,
        });
        ids.add(creado.id);
        resolvedAdjuntos.push(creado);
      }
    }

    // 4) Mensajes con contenido de adjuntos
    const attachmentMessages = [];
    for (const a of resolvedAdjuntos.slice(0, MAX_FILES_TO_ATTACH)) {
      let textContent = null;
      if (a.contenidoExtraido) {
        textContent = a.contenidoExtraido;
      } else if (a.rutaArchivo) {
        try {
          textContent = fs.readFileSync(a.rutaArchivo, "utf8");
        } catch {
          textContent = `[No se pudo leer: ${a.nombreArchivo}]`;
        }
      } else {
        textContent = `[Adjunto sin contenido: ${a.nombreArchivo}]`;
      }

      const snippet = textContent.length > MAX_CHARS_PER_FILE
        ? textContent.slice(0, MAX_CHARS_PER_FILE) + "\n...[TRUNCADO POR LARGO]..."
        : textContent;

      attachmentMessages.push({ rol: "system", contenido: `Archivo adjunto: ${a.nombreArchivo}\n\n${snippet}` });
    }

    // 5) Construir prompt final
    const finalMessagesForModel = [...attachmentMessages, ...mensajesFormateados, { rol: rolNormalizado, contenido }];

    // 6) Guardar mensaje del usuario
    const adjFinal = resolvedAdjuntos.map((a) => a.id);
    const mensajeUsuario = await Mensaje.create({
      conversacionId,
      rol: rolNormalizado,
      contenido,
      archivosAdjuntos: adjFinal
    });

    // 7) STREAMING via socket (mantener tu comportamiento actual)
    const useStream = stream === "true" || stream === true;
    if (useStream && socketId) {
      res.json({ ok: true, mensajeUsuario, streaming: true });

      // usamos chatWithOllama en streaming tal como antes; esto no se orquesta
      chatWithOllama({ mensajes: finalMessagesForModel, stream: true, socketId })
        .then(async (resp) => {
          const mensajeIA = await Mensaje.create({ conversacionId, rol: "asistente", contenido: resp.content });
          socketService.emitToSocket(socketId, "mensaje_completado", { mensaje: mensajeIA });
        })
        .catch((err) => {
          socketService.emitToSocket(socketId, "error_chat", { error: err.message });
        });

      return;
    }

    // 8) MODO NORMAL (RESPUESTA COMPLETA) -> usar orquestador, guardar metadata y modelResponses
    const plan = await chooseModelForMessages(finalMessagesForModel);
    let chosenModel = (plan && (plan.selectedModel || plan.model)) ? (plan.selectedModel || plan.model) : process.env.OLLAMA_MODEL || 'qwen2.5:7b';

    // Ejecutar workflow y obtener todas las respuestas
    const execResult = await executeWorkflow({ mensajes: finalMessagesForModel, plan, socketId });

    const mensajeIA = await Mensaje.create({
      conversacionId,
      rol: "asistente",
      contenido: execResult.finalOutput,
      metadata: { chosenModel, planner: plan || null, timestamp: new Date() },
      modelResponses: execResult.results.map(r => ({
        step: r.step,
        model: r.model,
        raw: r.response.raw || null,
        contentPreview: (r.response.content || '').slice(0, 2000)
      }))
    });

    if (socketId) {
      try { socketService.emitToSocket(socketId, 'mensaje_completado', { mensaje: mensajeIA }); } catch (e) {}
    }

    res.json({ ok: true, mensajeUsuario, mensajeIA, orchestration: { plan, resultsCount: execResult.results.length } });
  } catch (err) {
    next(err);
  }
};

module.exports = { crearConversacion, listarConversaciones, obtenerConversacion, agregarMensaje };
