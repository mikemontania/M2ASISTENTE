const { upload } = require('../services/uploads.service');
const ArchivoAdjunto = require('../models/archivoAdjunto.model');
const { extractTextFromPdf } = require('../services/pdf.service');
const path = require('path');

const singleUploadMiddleware = upload.single('file');

const subirArchivo = (req, res, next) => {
  singleUploadMiddleware(req, res, async (err) => {
    try {
      if (err) return next(err);
      if (!req.file) return res.status(400).json({ error: 'No file' });

      const filePath = req.file.path;
      const nombre = req.file.originalname;
      const mimetype = req.file.mimetype;

      let contenidoExtraido = null;
      if (mimetype === 'application/pdf' || path.extname(req.file.originalname).toLowerCase() === '.pdf') {
        try {
          contenidoExtraido = await extractTextFromPdf(filePath);
        } catch (e) {
          console.warn('PDF parse error', e);
        }
      }

      const registro = await ArchivoAdjunto.create({
        conversacionId: req.body.conversacionId || null,
        nombreArchivo: nombre,
        rutaArchivo: filePath,
        mimeType: mimetype,
        contenidoExtraido
      });

      res.json({ ok: true, archivo: registro });
    } catch (e) {
      next(e);
    }
  });
};

module.exports = { subirArchivo };