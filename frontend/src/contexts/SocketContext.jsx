import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);
export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const url = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3888';
    const s = io(url, { transports: ['websocket'], autoConnect: true });
    setSocket(s);
    s.on('connect', () => console.log('Socket conectado', s.id));
    s.on('disconnect', () => console.log('Socket desconectado'));
    return () => s.close();
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
};