// src/components/UI.js
// Shared reusable components for Mehfooz Ride

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { C, GRAD } from '../utils/theme';

// ─── Input ───────────────────────────────────────────────────────────────────
export function Input({
  label, icon, placeholder, value, onChangeText,
  secureTextEntry = false, keyboardType = 'default',
  autoCapitalize = 'sentences', style,
}) {
  return (
    <View>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.inputRow}>
        {icon ? <Text style={s.icon}>{icon}</Text> : null}
        <TextInput
          style={[s.input, icon && s.inputWithIcon, style]}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
        />
      </View>
    </View>
  );
}

// ─── PrimaryBtn ───────────────────────────────────────────────────────────────
export function PrimaryBtn({ title, onPress, loading = false, style, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}
      style={style}
    >
      <LinearGradient
        colors={GRAD.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[s.primaryBtn, (loading || disabled) && { opacity: 0.6 }]}
      >
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.primaryBtnText}>{title}</Text>
        }
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── GhostBtn ────────────────────────────────────────────────────────────────
export function GhostBtn({ title, onPress, style, color }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[s.ghostBtn, style, color && { borderColor: color }]}
    >
      <Text style={[s.ghostBtnText, color && { color }]}>{title}</Text>
    </TouchableOpacity>
  );
}

// ─── SecondaryBtn ────────────────────────────────────────────────────────────
export function SecondaryBtn({ title, onPress, style }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[s.secondaryBtn, style]}>
      <Text style={s.secondaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

// ─── DangerBtn ───────────────────────────────────────────────────────────────
export function DangerBtn({ title, onPress, style }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[s.dangerBtn, style]}>
      <Text style={s.dangerBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────
// Accepts both 'text' and 'label' props for compatibility
export function Badge({ text, label, color = C.rose, bg = C.rosePale }) {
  const displayText = text || label || '';
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color }]}>{displayText}</Text>
    </View>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, style }) {
  return (
    <View style={[s.card, style]}>
      {children}
    </View>
  );
}

// ─── StarRow ─────────────────────────────────────────────────────────────────
export function StarRow({ rating, setRating, size = 28 }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <TouchableOpacity
          key={star}
          onPress={() => setRating && setRating(star)}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: size, opacity: star <= rating ? 1 : 0.25 }}>⭐</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
    paddingHorizontal: 14,
  },
  icon: {
    fontSize: 17,
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14,
    color: C.text,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  primaryBtn: {
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ghostBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.rose,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  ghostBtnText: {
    color: C.rose,
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: C.rosePale,
    borderWidth: 1,
    borderColor: `${C.rose}30`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: C.rose,
    fontSize: 14,
    fontWeight: '600',
  },
  dangerBtn: {
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});
