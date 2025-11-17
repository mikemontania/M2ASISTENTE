const express = require('express');
const router = express.Router();
const uploadsController = require('../controllers/uploads.controller');

router.post('/', uploadsController.subirArchivo);

module.exports = router;