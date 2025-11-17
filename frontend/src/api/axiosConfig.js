import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3888';

const instance = axios.create({
  baseURL: API_URL,
  timeout: 120000
});

export default instance;