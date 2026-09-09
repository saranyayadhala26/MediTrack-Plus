/**
 * Configured Axios HTTP Client with Authorization Interceptors
 */

import axios from "axios";
import { config } from "../constants/config";
import { storage } from "../storage/asyncStorage";

export const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Request interceptor: attach bearer token
apiClient.interceptors.request.use(
  async (requestConfig) => {
    const token = await storage.getToken();
    if (token && requestConfig.headers) {
      requestConfig.headers.Authorization = `Bearer ${token}`;
    }
    return requestConfig;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: catch 401 unauthorized
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      // Token is invalid or expired
      await storage.clearSession();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
