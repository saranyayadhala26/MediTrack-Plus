/**
 * Centralized Authentication Context & Session Management
 * Coordinates secure login, registration, logout, profile updates,
 * and hardware-backed session persistence via Expo SecureStore.
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import apiClient from "../api/client";
import { ENDPOINTS } from "../api/endpoints";
import { secureStorage } from "../storage/secureStorage";
import { User, UserRole } from "../types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    fullName: string,
    email: string,
    password: string,
    confirmPassword: string,
    role: UserRole,
    emergencyContact?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore authenticated session from SecureStore on startup
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await secureStorage.getToken();
        const storedUser = await secureStorage.getUser();

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(storedUser);

          // Proactively verify token validity against backend /auth/me
          try {
            const response = await apiClient.get(ENDPOINTS.AUTH.PROFILE);
            setUser(response.data);
            await secureStorage.saveUser(response.data);
          } catch (verifyError: any) {
            // Token expired or invalid
            if (verifyError.response && verifyError.response.status === 401) {
              await secureStorage.clearAuthSession();
              setToken(null);
              setUser(null);
            }
          }
        }
      } catch (err) {
        console.error("Session restoration error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiClient.post(ENDPOINTS.AUTH.LOGIN, {
        email: email.trim().toLowerCase(),
        password,
      });

      const { access_token, user: loggedInUser } = response.data;

      await secureStorage.saveToken(access_token);
      await secureStorage.saveUser(loggedInUser);

      setToken(access_token);
      setUser(loggedInUser);

      return { success: true };
    } catch (err: any) {
      const message =
        err.response?.data?.detail || "Invalid email or password. Please check your credentials.";
      return { success: false, error: message };
    }
  };

  const register = async (
    fullName: string,
    email: string,
    password: string,
    confirmPassword: string,
    role: UserRole,
    emergencyContact?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiClient.post(ENDPOINTS.AUTH.REGISTER, {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        role,
        emergencyContact: emergencyContact ? emergencyContact.trim() : undefined,
      });

      const { access_token, user: registeredUser } = response.data;

      await secureStorage.saveToken(access_token);
      await secureStorage.saveUser(registeredUser);

      setToken(access_token);
      setUser(registeredUser);

      return { success: true };
    } catch (err: any) {
      let message = "Registration failed. Please check your details and try again.";
      if (err.response?.data?.detail) {
        if (typeof err.response.data.detail === "string") {
          message = err.response.data.detail;
        } else if (Array.isArray(err.response.data.detail)) {
          message = err.response.data.detail[0]?.msg || message;
        }
      }
      return { success: false, error: message };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await secureStorage.clearAuthSession();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  const updateProfile = async (
    data: Partial<User>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiClient.patch(ENDPOINTS.AUTH.UPDATE_PROFILE, data);
      const updatedUser = response.data;
      await secureStorage.saveUser(updatedUser);
      setUser(updatedUser);
      return { success: true };
    } catch (err: any) {
      const message = err.response?.data?.detail || "Failed to update profile.";
      return { success: false, error: message };
    }
  };

  const refreshProfile = async (): Promise<void> => {
    try {
      const response = await apiClient.get(ENDPOINTS.AUTH.PROFILE);
      await secureStorage.saveUser(response.data);
      setUser(response.data);
    } catch (err) {
      console.error("Error refreshing profile:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        login,
        register,
        logout,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
