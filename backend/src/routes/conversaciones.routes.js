const express = require('express');
const router = express.Router();
const controller = require('../controllers/conversaciones.controller');

router.post('/crear', controller.crearConversacion);
router.get('/', controller.listarConversaciones);
router.get('/:id', controller.obtenerConversacion);
router.post('/mensaje', controller.agregarMensaje);

module.exports = router;