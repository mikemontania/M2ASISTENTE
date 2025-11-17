let ioInstance = null;

const init = (io) => {
  ioInstance = io;

  ioInstance.on('connection', (socket) => {
    // simple logging and ability to join rooms if client wants
    console.log(`Socket conectado: ${socket.id}`);
    socket.on('join', (room) => {
      if (room) socket.join(room);
    });
    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.id}`);
    });
  });
};

const emitToSocket = (socketId, event, payload) => {
  if (!ioInstance) return;
  try {
    ioInstance.to(socketId).emit(event, payload);
  } catch (err) {
    console.warn('emitToSocket error:', err);
  }
};

const emitAll = (event, payload) => {
  if (!ioInstance) return;
  ioInstance.emit(event, payload);
};

module.exports = { init, emitToSocket, emitAll };