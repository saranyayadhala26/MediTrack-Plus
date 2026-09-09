/**
 * Configured Axios HTTP Client with Hardware-Backed Secure Authorization Interceptors
 */

import axios from "axios";
import { config } from "../constants/config";
import { secureStorage } from "../storage/secureStorage";

export const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Request interceptor: attach bearer token securely retrieved from hardware Keystore
apiClient.interceptors.request.use(
  async (requestConfig) => {
    const token = await secureStorage.getToken();
    if (token && requestConfig.headers) {
      requestConfig.headers.Authorization = `Bearer ${token}`;
    }
    return requestConfig;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: catch 401 unauthorized & wipe secure session
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      // Token is invalid or expired - clear secure session
      await secureStorage.clearAuthSession();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
