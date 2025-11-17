require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { sequelize } = require('./src/config/database');
const socketService = require('./src/services/socket.service');
const errorHandler = require('./src/middlewares/errorHandler');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploads static
if (process.env.UPLOADS_DIR) {
  app.use('/uploads', express.static(path.resolve(process.env.UPLOADS_DIR)));
}

// Inicializar Socket.IO
socketService.init(io);

// Rutas
app.use('/conversaciones', require('./src/routes/conversaciones.routes'));
app.use('/proyectos', require('./src/routes/proyectos.routes'));
app.use('/archivos', require('./src/routes/archivos.routes'));
app.use('/uploads', require('./src/routes/uploads.routes'));

// Manejo de errores
app.use(errorHandler);

// Iniciar servidor
const PORT = process.env.PORT || 3888;

sequelize.sync({ force: process.env.DB_INIT === 'true' }).then(() => {
  server.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO listo`);
    console.log(`🤖 Ollama: ${process.env.OLLAMA_URL}`);
  });
}).catch(err => {
  console.error('Error inicializando DB:', err);
});