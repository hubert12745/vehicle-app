import axios from "axios";
import Storage from "./storage";

const api = axios.create({
  baseURL: "http://localhost:8000", // jeśli używasz Dockera, zamień na http://api:8000
});

// Interceptor automatycznie dodaje token JWT
api.interceptors.request.use(async (config) => {
  const token = await Storage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
