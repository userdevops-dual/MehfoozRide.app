// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on app open
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('mehfooz_token');
        if (saved) {
          setToken(saved);
          const res = await authAPI.getMe();
          if (res.success) {
            setUser(res.user);
            if (res.user.role !== 'admin') connectSocket(res.user._id);
          }
        }
      } catch {
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
      setToken(res.token);
      setUser(res.user);
      if (res.user.role !== 'admin') connectSocket(res.user._id);
    }
    return res;
  };

  const signup = async (formData) => {
    const res = await authAPI.signup(formData);
    if (res.success) {
      await AsyncStorage.setItem('mehfooz_token', res.token);
      setToken(res.token);
      setUser(res.user);
      if (res.user.role !== 'admin') connectSocket(res.user._id);
    }
    return res;
  };

  const logout = async () => {
    await AsyncStorage.removeItem('mehfooz_token');
    disconnectSocket();
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
