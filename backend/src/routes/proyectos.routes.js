const express = require('express');
const router = express.Router();
const proyectosController = require('../controllers/proyectos.controller');

router.post('/crear', proyectosController.crearProyecto);
router.get('/listar', proyectosController.listarProyectos);
router.delete('/:id', proyectosController.eliminarProyecto);

module.exports = router;