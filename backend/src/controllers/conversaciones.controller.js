// reemplaza tu archivo actual por este (añadí debug controlado por DEBUG_CHAT)
const Conversacion = require('../models/conversacion.model');
const Mensaje = require('../models/mensaje.model');
const ArchivoAdjunto = require('../models/archivoAdjunto.model');
const { chatWithOllama } = require('../services/ia.service');
const socketService = require('../services/socket.service');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../services/uploads.service');

 

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
        return res.status(409).json({
          error: "Archivo adjunto aún no está listo. Reintentar.",
          archivoId: id,
        });
      }
    }

    // ------------------------------------------------------
    // 2) Historial anterior (30 mensajes más recientes)
    // ------------------------------------------------------
    let mensajesAnteriores = await Mensaje.findAll({
      where: { conversacionId },
      order: [["marcaDeTiempo", "DESC"]],
      limit: 30,
    });

    mensajesAnteriores = mensajesAnteriores.reverse(); // orden correcto

    const mensajesFormateados = mensajesAnteriores.map((m) => ({
      rol: m.rol,
      contenido: m.contenido,
    }));

    // ------------------------------------------------------
    // 3) Resolver adjuntos (evitar duplicados y crear si falta)
    // ------------------------------------------------------
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
        found = await ArchivoAdjunto.findOne({
          where: { rutaArchivo: item.rutaArchivo },
        });
      }

      // Si ya existe y no está duplicado
      if (found) {
        if (!ids.has(found.id)) {
          ids.add(found.id);
          resolvedAdjuntos.push(found);
        }
        continue;
      }

      // Crear si es un archivo nuevo
      if (!found && (item.rutaArchivo || item.nombreArchivo)) {
        const creado = await ArchivoAdjunto.create({
          conversacionId,
          nombreArchivo:
            item.nombreArchivo ||
            path.basename(item.rutaArchivo || "archivo"),
          rutaArchivo: item.rutaArchivo || "",
          mimeType: item.mimeType || null,
          contenidoExtraido: item.contenidoExtraido || null,
        });

        ids.add(creado.id);
        resolvedAdjuntos.push(creado);
      }
    }

    // ------------------------------------------------------
    // 4) Crear mensajes del sistema con contenido de adjuntos
    // ------------------------------------------------------
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

      const snippet =
        textContent.length > MAX_CHARS_PER_FILE
          ? textContent.slice(0, MAX_CHARS_PER_FILE) +
            "\n...[TRUNCADO POR LARGO]..."
          : textContent;

      attachmentMessages.push({
        rol: "system",
        contenido: `Archivo adjunto: ${a.nombreArchivo}\n\n${snippet}`,
      });
    }

    // ------------------------------------------------------
    // 5) Construir el prompt final para la IA
    // ------------------------------------------------------
    const finalMessagesForModel = [
      ...attachmentMessages,
      ...mensajesFormateados,
      { rol: rolNormalizado, contenido },
    ];

    // ------------------------------------------------------
    // 6) Guardar mensaje del usuario (adjuntos como IDs)
    // ------------------------------------------------------
    const adjFinal = resolvedAdjuntos.map((a) => a.id);

    const mensajeUsuario = await Mensaje.create({
      conversacionId,
      rol: rolNormalizado,
      contenido,
      archivosAdjuntos: adjFinal,
    });

    // ------------------------------------------------------
    // 7) STREAMING VIA SOCKET
    // ------------------------------------------------------
    const useStream = stream === "true" || stream === true;

    if (useStream && socketId) {
      res.json({
        ok: true,
        mensajeUsuario,
        streaming: true,
      });

      chatWithOllama({
        mensajes: finalMessagesForModel,
        stream: true,
        socketId,
      })
        .then(async (resp) => {
          const mensajeIA = await Mensaje.create({
            conversacionId,
            rol: "asistente",
            contenido: resp.content,
          });

          socketService.emitToSocket(socketId, "mensaje_completado", {
            mensaje: mensajeIA,
          });
        })
        .catch((err) => {
          socketService.emitToSocket(socketId, "error_chat", {
            error: err.message,
          });
        });

      return;
    }

    // ------------------------------------------------------
    // 8) MODO NORMAL (RESPUESTA COMPLETA)
    // ------------------------------------------------------
    const resp = await chatWithOllama({
      mensajes: finalMessagesForModel,
      stream: false,
    });

    const mensajeIA = await Mensaje.create({
      conversacionId,
      rol: "asistente",
      contenido: resp.content,
    });

    res.json({
      ok: true,
      mensajeUsuario,
      mensajeIA,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { crearConversacion, listarConversaciones, obtenerConversacion, agregarMensaje };