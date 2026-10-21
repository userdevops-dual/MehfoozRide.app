// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, setAuthToken } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [loading, setLoading] = useState(true);

  const startSession = (newToken, newUser) => {
    setAuthToken(newToken);
    setToken(newToken);
    setUser(newUser);
    connectSocket(newToken);
  };

  // Restore session on app open
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('mehfooz_token');
        if (saved) {
          setAuthToken(saved);
          const res = await authAPI.getMe();
          if (res.success) startSession(saved, res.user);
        }
      } catch {
        setAuthToken(null);
        await AsyncStorage.removeItem('mehfooz_token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    if (res.success) {
      await AsyncStorage.setItem('mehfooz_token', res.token);
      startSession(res.token, res.user);
    }
    return res;
  };

  const signup = async (fields, images) => {
    const res = await authAPI.signup(fields, images);
    if (res.success) {
      await AsyncStorage.setItem('mehfooz_token', res.token);
      startSession(res.token, res.user);
    }
    return res;
  };

  const logout = async () => {
    await AsyncStorage.removeItem('mehfooz_token');
    disconnectSocket();
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  const updateUser = (updates) =>
    setUser(prev => prev ? { ...prev, ...updates } : null);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
