import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('atchaar-token');
    const savedUser = localStorage.getItem('atchaar-user');
    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        // Optionally verify token with /me endpoint
        axios.get(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(res => {
          const freshUser = res.data?.data || res.data;
          setUser(freshUser);
          localStorage.setItem('atchaar-user', JSON.stringify(freshUser));
        }).catch(() => {
          // Token may be expired
          localStorage.removeItem('atchaar-token');
          localStorage.removeItem('atchaar-user');
          setUser(null);
        }).finally(() => setLoading(false));
      } catch {
        localStorage.removeItem('atchaar-token');
        localStorage.removeItem('atchaar-user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    const data = res.data?.data || res.data;
    const { token, user: userData } = data;
    localStorage.setItem('atchaar-token', token);
    localStorage.setItem('atchaar-user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('atchaar-token');
    localStorage.removeItem('atchaar-user');
    setUser(null);
    toast.success('Logged out successfully');
    window.location.href = '/login';
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const token = localStorage.getItem('atchaar-token');
    const res = await axios.post(
      `${API_URL}/auth/change-password`,
      { currentPassword, newPassword },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  }, []);

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin';
  const isCashier = user?.role === 'cashier';

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated,
      isAdmin,
      isCashier,
      login,
      logout,
      changePassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
