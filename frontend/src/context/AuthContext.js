// src/context/AuthContext.js
// Session (JWT + user) and the active app mode: 'passenger' | 'driver'.
// After login/signup the user picks a mode (RoleSelect screen); on app restart
// the last mode for that user is restored. Admins have no mode.
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, setAuthToken } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = 'mehfooz_token';
const modeKey = (userId) => `mehfooz_mode_${userId}`;

// Which modes this account may use. Every user can ride as a passenger;
// only driver accounts can use driver mode.
export const allowedModes = (user) =>
  !user || user.role === 'admin' ? [] : user.role === 'driver' ? ['passenger', 'driver'] : ['passenger'];

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [mode,    setModeState] = useState(null);
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
        const saved = await AsyncStorage.getItem(TOKEN_KEY);
        if (saved) {
          setAuthToken(saved);
          const res = await authAPI.getMe();
          if (res.success) {
            const savedMode = await AsyncStorage.getItem(modeKey(res.user._id));
            setModeState(allowedModes(res.user).includes(savedMode) ? savedMode : null);
            startSession(saved, res.user);
          }
        }
      } catch (err) {
        // Only an invalid/expired token ends the session — not a network problem
        if (err?.response?.status === 401) {
          setAuthToken(null);
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fresh login/signup → the user chooses a mode on the RoleSelect screen
  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    if (res.success) {
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      setModeState(null);
      startSession(res.token, res.user);
    }
    return res;
  };

  const signup = async (fields, images) => {
    const res = await authAPI.signup(fields, images);
    if (res.success) {
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      setModeState(null);
      startSession(res.token, res.user);
    }
    return res;
  };

  // mode: 'passenger' | 'driver' | null (null → show the RoleSelect screen)
  const setMode = async (next) => {
    if (next && !allowedModes(user).includes(next)) return false;
    setModeState(next);
    if (user?._id) {
      if (next) await AsyncStorage.setItem(modeKey(user._id), next);
      else await AsyncStorage.removeItem(modeKey(user._id));
    }
    return true;
  };

  const logout = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    disconnectSocket();
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setModeState(null);
  };

  const updateUser = (updates) =>
    setUser(prev => prev ? { ...prev, ...updates } : null);

  return (
    <AuthContext.Provider value={{ user, token, mode, loading, login, signup, logout, updateUser, setMode }}>
      {children}
    </AuthContext.Provider>
  );
};
