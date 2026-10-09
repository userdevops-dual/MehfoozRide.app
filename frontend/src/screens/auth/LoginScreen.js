// src/screens/auth/LoginScreen.js
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/UI';
import { C, GRAD } from '../../utils/theme';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [loading,    setLoading]    = useState(false);

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert('Missing Fields', 'Please enter your email and password.'); return;
    }
    setLoading(true);
    try {
      const res = await login(identifier.trim().toLowerCase(), password);
      // On success AppNavigator remounts on the role's home screen
      if (!res.success) {
        Alert.alert('Login Failed', res.message || 'Invalid credentials');
      }
    } catch (err) {
      Alert.alert('Login Failed', err.response?.data?.message || 'Server error. Is backend running?');
    } finally { setLoading(false); }
  };

  const fillDemo = role => {
    if (role === 'admin')    { setIdentifier('admin@mehfooz.com');   setPassword('admin123'); }
    if (role === 'driver')   { setIdentifier('fatima@demo.com');     setPassword('password123'); }
    if (role === 'passenger'){ setIdentifier('ayesha@demo.com');     setPassword('password123'); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <LinearGradient colors={GRAD.primary} style={styles.banner}>
          <Text style={styles.logo}>🛡️</Text>
          <Text style={styles.title}>Mehfooz Ride</Text>
          <Text style={styles.sub}>Women-Only Safe Transportation</Text>
        </LinearGradient>

        <View style={styles.body}>
          <Text style={styles.heading}>Welcome Back 🌸</Text>
          <Text style={styles.subheading}>Sign in to your account</Text>

          <Input
            label="Email Address"
            icon="📧"
            placeholder="ayesha@example.com"
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={{ height: 12 }} />

          <View>
            <Input
              label="Password"
              icon="🔒"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(p => !p)} style={styles.eyeBtn}>
              <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 24 }} />

          <TouchableOpacity
            onPress={handleLogin}
            style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            disabled={loading}
          >
            <LinearGradient colors={GRAD.primary} style={styles.loginBtnGrad}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.loginBtnText}>Sign In →</Text>
              }
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {/* Demo account quick-fill */}
          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>🧪 Demo Quick Login</Text>
            <View style={styles.demoRow}>
              {[
                { role: 'passenger', icon: '👩', label: 'Passenger' },
                { role: 'driver',    icon: '🚗', label: 'Driver' },
                { role: 'admin',     icon: '⚙️', label: 'Admin' },
              ].map(d => (
                <TouchableOpacity key={d.role} onPress={() => fillDemo(d.role)} style={styles.demoBtn}>
                  <Text style={{ fontSize: 20 }}>{d.icon}</Text>
                  <Text style={styles.demoBtnText}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.demoNote}>Tap above to auto-fill demo credentials, then tap Sign In</Text>
            <View style={styles.credBox}>
              <Text style={styles.credText}>👩 Passenger: ayesha@demo.com / password123</Text>
              <Text style={styles.credText}>🚗 Driver:    fatima@demo.com / password123</Text>
              <Text style={styles.credText}>⚙️ Admin:     admin@mehfooz.com / admin123</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: C.bg },
  banner:       { alignItems: 'center', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 24 },
  logo:         { fontSize: 64, marginBottom: 10 },
  title:        { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  sub:          { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 6, textAlign: 'center' },
  body:         { padding: 24 },
  heading:      { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
  subheading:   { fontSize: 13, color: C.muted, marginBottom: 24 },
  eyeBtn:       { position: 'absolute', right: 14, top: 38 },
  loginBtn:     { borderRadius: 18, overflow: 'hidden', marginBottom: 20 },
  loginBtnGrad: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  signupRow:    { flexDirection: 'row', justifyContent: 'center', marginBottom: 28 },
  signupText:   { color: C.muted, fontSize: 14 },
  signupLink:   { color: C.rose, fontWeight: '700', fontSize: 14 },
  demoBox:      { backgroundColor: C.rosePale, borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: `${C.rose}25` },
  demoTitle:    { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 12 },
  demoRow:      { flexDirection: 'row', gap: 10, marginBottom: 10 },
  demoBtn:      { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.border },
  demoBtnText:  { fontSize: 11, fontWeight: '700', color: C.text },
  demoNote:     { fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 10 },
  credBox:      { backgroundColor: '#fff', borderRadius: 10, padding: 10, gap: 3 },
  credText:     { fontSize: 10, color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
