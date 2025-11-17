import axios from './axiosConfig';

export const listarConversaciones = () => axios.get('/conversaciones/');
export const obtenerConversacion = (id) => axios.get(`/conversaciones/${id}`);
export const crearConversacion = (titulo = 'Nueva conversación') =>
  axios.post('/conversaciones/crear', { titulo });
export const agregarMensaje = (data, stream = false, socketId = null) => {
  const qs = stream ? `?stream=true${socketId ? `&socketId=${socketId}` : ''}` : '';
  return axios.post(`/conversaciones/mensaje${qs}`, data);
};
export const subirArchivo = (formData) =>
  axios.post('/uploads', formData, { headers: { 'Content-Type': 'multipart/form-data' } });