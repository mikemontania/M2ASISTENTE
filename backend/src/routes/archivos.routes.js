const express = require('express');
const router = express.Router();
const archivosController = require('../controllers/archivos.controller');

router.get('/listar/:projectId', archivosController.listarArchivos);
router.get('/leer/:projectId', archivosController.leerArchivo);
router.post('/crear/:projectId', archivosController.crearArchivo);
router.put('/editar/:projectId', archivosController.editarArchivo);

module.exports = router;