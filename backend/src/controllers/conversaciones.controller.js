// controllers/conversaciones.controller.js
const Conversacion = require('../models/conversacion.model')
const Mensaje = require('../models/mensaje.model')
const ArchivoAdjunto = require('../models/archivoAdjunto.model')
const { chatWithOllama } = require('../services/ia.service')
const {
  chooseModelForMessages,
  executeWorkflow
} = require('../services/modelOrchestrator.service')
const socketService = require('../services/socket.service')
const fs = require('fs')
const path = require('path')
const { UPLOADS_DIR } = require('../services/uploads.service')

const MAX_CHARS_PER_FILE = 15000
const MAX_FILES_TO_ATTACH = 25
const DEBUG_TRUNCATE = 8000

const truncate = (s, n = DEBUG_TRUNCATE) => {
  if (typeof s !== 'string') return s
  if (s.length <= n) return s
  return s.slice(0, n) + `\n\n...[TRUNCADO ${s.length - n} chars]...`
}

const crearConversacion = async (req, res, next) => {
  try {
    const { titulo } = req.body
    const conversacion = await Conversacion.create({
      titulo: titulo || 'Nueva conversación'
    })
    res.json(conversacion)
  } catch (err) {
    next(err)
  }
}

const listarConversaciones = async (req, res, next) => {
  try {
    const conversaciones = await Conversacion.findAll({
      order: [['updatedAt', 'DESC']],
      include: [
        { model: Mensaje, limit: 1, order: [['marcaDeTiempo', 'DESC']] }
      ]
    })
    res.json(conversaciones)
  } catch (err) {
    next(err)
  }
}

const obtenerConversacion = async (req, res, next) => {
  try {
    const { id } = req.params
    const conversacion = await Conversacion.findByPk(id, {
      include: [{ model: Mensaje, order: [['marcaDeTiempo', 'ASC']] }]
    })
    if (!conversacion)
      return res.status(404).json({ error: 'Conversación no encontrada' })
    res.json(conversacion)
  } catch (err) {
    next(err)
  }
}

function normalizarRol (rol) {
  if (!rol) return 'usuario'
  const r = rol.toLowerCase()
  if (r === 'user' || r === 'usuario') return 'usuario'
  if (r === 'assistant' || r === 'asistente') return 'asistente'
  if (r === 'system' || r === 'sistema') return 'system'
  return 'usuario'
}

const agregarMensaje = async (req, res, next) => {
  try {
    const { conversacionId, rol, contenido, archivosAdjuntos } = req.body
    const { stream, socketId } = req.query

    const rolNormalizado = normalizarRol(rol)

    // ------------------------------------------------------
    // 1) Verificar existencia previa de cada archivo adjunto
    // ------------------------------------------------------
    for (const item of archivosAdjuntos || []) {
      let id = typeof item === 'object' ? item.id : item
      if (!id) continue
      const existe = await ArchivoAdjunto.findByPk(id)
      if (!existe) {
        return res.status(409).json({
          error: 'Archivo adjunto aún no está listo. Reintentar.',
          archivoId: id
        })
      }
    }

    // ------------------------------------------------------
    // 2) RESOLVER ADJUNTOS PRIMERO (antes de construir historial)
    // ------------------------------------------------------
    const adj = Array.isArray(archivosAdjuntos) ? archivosAdjuntos : []
    const ids = new Set()
    const resolvedAdjuntos = []

    for (const item of adj) {
      if (!item) continue
      let found = null
      if (typeof item === 'number' || typeof item === 'string') {
        found = await ArchivoAdjunto.findByPk(item)
      } else if (item.id) {
        found = await ArchivoAdjunto.findByPk(item.id)
      } else if (item.rutaArchivo) {
        found = await ArchivoAdjunto.findOne({
          where: { rutaArchivo: item.rutaArchivo }
        })
      }

      if (found) {
        if (!ids.has(found.id)) {
          ids.add(found.id)
          resolvedAdjuntos.push(found)
        }
        continue
      }

      if (!found && (item.rutaArchivo || item.nombreArchivo)) {
        const creado = await ArchivoAdjunto.create({
          conversacionId,
          nombreArchivo:
            item.nombreArchivo || path.basename(item.rutaArchivo || 'archivo'),
          rutaArchivo: item.rutaArchivo || '',
          mimeType: item.mimeType || null,
          contenidoExtraido: item.contenidoExtraido || null
        })
        ids.add(creado.id)
        resolvedAdjuntos.push(creado)
      }
    }

    // ------------------------------------------------------
    // 3) Historial anterior (30 mensajes más recientes)
    // ------------------------------------------------------
    let mensajesAnteriores = await Mensaje.findAll({
      where: { conversacionId },
      order: [['marcaDeTiempo', 'DESC']],
      limit: 30
    })
    mensajesAnteriores = mensajesAnteriores.reverse()
    
    const mensajesFormateados = mensajesAnteriores.map(m => {
      const msg = {
        rol: m.rol,
        contenido: m.contenido
      }

      // Si el mensaje tiene archivos adjuntos guardados, reconstruir imágenes
      if (m.archivosAdjuntos && m.archivosAdjuntos.length > 0) {
        const imageAttachments = []

        for (const adjId of m.archivosAdjuntos) {
          const adj = resolvedAdjuntos.find(a => a.id === adjId)
          if (adj && adj.mimeType && adj.mimeType.startsWith('image/')) {
            try {
              const buffer = fs.readFileSync(adj.rutaArchivo)
              const base64Data = buffer.toString('base64')
              imageAttachments.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: adj.mimeType,
                  data: base64Data
                }
              })
            } catch (err) {
              console.error(
                `Error leyendo imagen histórica ${adj.nombreArchivo}:`,
                err.message
              )
            }
          }
        }

        if (imageAttachments.length > 0) {
          msg.attachmentImages = imageAttachments
        }
      }

      return msg
    })

    // ------------------------------------------------------
    // 4) Mensajes con contenido de adjuntos (MEJORADO para imágenes)
    // ------------------------------------------------------
    const attachmentMessages = []
    const attachmentImages = [] // Array separado para imágenes
    let hasImages = false // Flag para detectar imágenes

    for (const a of resolvedAdjuntos.slice(0, MAX_FILES_TO_ATTACH)) {
      if (a.mimeType && a.mimeType.startsWith('image/')) {
        hasImages = true // Marcar que hay imágenes
        
        // IMÁGENES: guardar en array separado para envío especial
        try {
          const buffer = fs.readFileSync(a.rutaArchivo)
          const base64Data = buffer.toString('base64')
          
          attachmentImages.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: a.mimeType,
              data: base64Data
            }
          })

          console.log(
            `[INFO] Imagen cargada: ${a.nombreArchivo}, tamaño: ${buffer.length} bytes, base64 length: ${base64Data.length}`
          )
        } catch (err) {
          console.error(`Error leyendo imagen ${a.nombreArchivo}:`, err.message)
        }
      } else {
        // ARCHIVOS DE TEXTO: mantener como antes
        let textContent = null
        if (a.contenidoExtraido) {
          textContent = a.contenidoExtraido
        } else if (a.rutaArchivo) {
          try {
            textContent = fs.readFileSync(a.rutaArchivo, 'utf8')
          } catch {
            textContent = `[No se pudo leer: ${a.nombreArchivo}]`
          }
        } else {
          textContent = `[Adjunto sin contenido: ${a.nombreArchivo}]`
        }

        const snippet =
          textContent.length > MAX_CHARS_PER_FILE
            ? textContent.slice(0, MAX_CHARS_PER_FILE) +
              '\n...[TRUNCADO POR LARGO]...'
            : textContent

        attachmentMessages.push({
          rol: 'system',
          contenido: `Archivo adjunto: ${a.nombreArchivo}\n\n${snippet}`
        })
      }
    }

    // ------------------------------------------------------
    // 5) Construir prompt final CON imágenes adjuntas
    // ------------------------------------------------------
    const finalMessagesForModel = [
      ...attachmentMessages,
      ...mensajesFormateados,
      {
        rol: rolNormalizado,
        contenido,
        attachmentImages: attachmentImages.length > 0 ? attachmentImages : undefined,
        hasImages // Pasar flag explícito
      }
    ]
    
    // LOG: Verificar construcción
    console.log('[INFO] Mensaje construido:', {
      totalMessages: finalMessagesForModel.length,
      hasImages,
      imagesCount: attachmentImages.length,
      lastMessageContent: contenido.slice(0, 100)
    })

    // ------------------------------------------------------
    // 6) Guardar mensaje del usuario
    // ------------------------------------------------------
    const adjFinal = resolvedAdjuntos.map(a => a.id)
    const mensajeUsuario = await Mensaje.create({
      conversacionId,
      rol: rolNormalizado,
      contenido,
      archivosAdjuntos: adjFinal
    })

    // ------------------------------------------------------
    // 7) STREAMING via socket
    // ------------------------------------------------------
    const useStream = stream === 'true' || stream === true
  // 7) STREAMING via socket
if (useStream && socketId) {
  res.json({ ok: true, mensajeUsuario, streaming: true });

  // FORZAR ORQUESTADOR ANTES DE STREAMING
  const plan = await chooseModelForMessages(finalMessagesForModel, hasImages);
  const chosenModel = plan.selectedModel || 'llava:7b';

  console.log('[STREAM] Orquestador eligió modelo:', chosenModel, 'workflow:', plan.workflow);

  chatWithOllama({
    mensajes: finalMessagesForModel,
    stream: true,
    socketId,
    hasImages,
    model: chosenModel          // ← LÍNEA CRÍTICA
  })
    .then(async resp => {
      const mensajeIA = await Mensaje.create({
        conversacionId,
        rol: 'asistente',
        contenido: resp.content,
        metadata: { 
          chosenModel,
          plannedModel: chosenModel,
          timestamp: new Date(),
          hasImages,
          streamMode: true
        }
      });
      socketService.emitToSocket(socketId, 'mensaje_completado', { mensaje: mensajeIA });
    })
    .catch(err => {
      socketService.emitToSocket(socketId, 'error_chat', { error: err.message });
    });

  return;
}

    // ------------------------------------------------------
    // 8) MODO NORMAL (RESPUESTA COMPLETA)
    // ------------------------------------------------------
const plan = await chooseModelForMessages(finalMessagesForModel, hasImages);
// si detectamos imágenes y el plan no sugiere vision, forzarlo (seguridad)
if (hasImages && (!plan.workflow || !plan.workflow.includes('vision'))) {
  plan.workflow = ['vision','adaptive'];
  plan.selectedModel = 'llava:7b';
  plan.reason = 'forced-vision-by-controller';
}    
    console.log('[INFO] Plan seleccionado:', {
      model: plan.selectedModel,
      reason: plan.reason,
      workflow: plan.workflow,
      requirements: plan.requirements
    })

    // Ejecutar workflow y obtener todas las respuestas
    const execResult = await executeWorkflow({
      mensajes: finalMessagesForModel,
      plan,
      socketId,
      hasImages
    })

    // Determinar el modelo final usado (puede cambiar por fallback)
    const actualModelUsed = execResult.actualModelsUsed?.[0] || plan.selectedModel

    const mensajeIA = await Mensaje.create({
      conversacionId,
      rol: 'asistente',
      contenido: execResult.finalOutput,
      metadata: { 
        chosenModel: actualModelUsed, // Modelo que realmente respondió
        plannedModel: plan.selectedModel, // Modelo que se planeó usar
        planner: plan,
        timestamp: new Date(),
        hasImages,
        requirements: plan.requirements,
        metrics: execResult.metrics,
        retries: execResult.metrics.retries
      },
      modelResponses: execResult.results.map(r => ({
        step: r.step,
        model: r.model,
        attempts: r.attempts,
        duration: r.duration,
        raw: r.response.raw || null,
        contentPreview: (r.response.content || '').slice(0, 2000)
      }))
    })

    if (socketId) {
      try {
        socketService.emitToSocket(socketId, 'mensaje_completado', {
          mensaje: mensajeIA
        })
      } catch (e) {
        console.warn('[WARN] Socket emit failed:', e.message)
      }
    }

    res.json({
      ok: true,
      mensajeUsuario,
      mensajeIA,
      orchestration: { 
        plan, 
        resultsCount: execResult.results.length,
        metrics: execResult.metrics
      }
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  crearConversacion,
  listarConversaciones,
  obtenerConversacion,
  agregarMensaje
}