// frontend/src/screens/shared/ProfileScreen.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Switch, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import { C } from '../../utils/theme';
import { passwordRules } from '../../utils/validation';

export default function ProfileScreen({ navigation }) {
  const { user, logout, updateUser, mode, setMode } = useAuth();

  const [editing,     setEditing]     = useState(false);
  const [name,        setName]        = useState(user?.name        || '');
  const [phone,       setPhone]       = useState(user?.phone       || '');
  const [loading,     setLoading]     = useState(false);
  const [showPassSec, setShowPassSec] = useState(false);
  const [curPass,     setCurPass]     = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [confPass,    setConfPass]    = useState('');

  // ── Save profile changes ────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Name cannot be empty.'); return;
    }
    setLoading(true);
    try {
      const res = await authAPI.updateProfile({ name: name.trim(), phone: phone.trim() });
      if (res.success) {
        updateUser({ name: name.trim(), phone: phone.trim() });
        setEditing(false);
        Alert.alert('✅ Saved', 'Your profile has been updated.');
      }
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update profile.');
    } finally {
      setLoading(false);
    }
  };

  // ── Change password ─────────────────────────────────────────────────────────
  const changePassword = async () => {
    if (!curPass || !newPass || !confPass) {
      Alert.alert('Missing Fields', 'Please fill all password fields.'); return;
    }
    if (newPass !== confPass) {
      Alert.alert('Mismatch', 'New passwords do not match.'); return;
    }
    const missing = passwordRules(newPass).filter(r => !r.ok);
    if (missing.length) {
      Alert.alert('Weak Password', 'Your new password needs: ' + missing.map(r => r.label.toLowerCase()).join(', ') + '.'); return;
    }
    setLoading(true);
    try {
      const res = await authAPI.changePassword(curPass, newPass);
      if (res.success) {
        Alert.alert('✅ Done', 'Password changed successfully.');
        setCurPass(''); setNewPass(''); setConfPass('');
        setShowPassSec(false);
      }
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not change password.');
    } finally {
      setLoading(false);
    }
  };

  // ── Confirm logout ──────────────────────────────────────────────────────────
  const confirmLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const isDriver = user?.role === 'driver';

  return (
    <View style={s.screen}>
      {/* ── Header ── */}
      <LinearGradient colors={['#5C1448', '#C84B7A']} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={{ fontSize: 44 }}>👩</Text>
          </View>
          <View style={s.verifiedBadge}>
            <Text style={{ fontSize: 14 }}>✅</Text>
          </View>
        </View>
        <Text style={s.headerName}>{user?.name || 'User'}</Text>
        <Text style={s.headerRole}>{isDriver ? '🚗 Verified Driver' : '🧳 Passenger'}</Text>
        <View style={s.statsRow}>
          {[
            { lbl: 'Rides',  val: user?.totalRides   || 0 },
            { lbl: 'Rating', val: `${(user?.averageRating || 4.9).toFixed(1)} ⭐` },
            { lbl: 'Since',  val: user?.createdAt ? new Date(user.createdAt).getFullYear() : '2024' },
          ].map(item => (
            <View key={item.lbl} style={s.statBox}>
              <Text style={s.statVal}>{item.val}</Text>
              <Text style={s.statLbl}>{item.lbl}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>

        {/* ── Personal Info ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>👤 Personal Information</Text>
            <TouchableOpacity onPress={() => setEditing(!editing)} style={s.editBtn}>
              <Text style={s.editBtnText}>{editing ? 'Cancel' : '✏️ Edit'}</Text>
            </TouchableOpacity>
          </View>

          <InfoRow label="Full Name" value={name} editing={editing}
            onChangeText={setName} placeholder="Your full name" />
          <InfoRow label="Email" value={user?.email || ''} editing={false}
            placeholder="" />
          <InfoRow label="Phone" value={phone} editing={editing}
            onChangeText={setPhone} placeholder="+92 300 0000000"
            keyboardType="phone-pad" />
          <InfoRow label="Gender" value="Female (Mehfooz Ride is women-only)"
            editing={false} placeholder="" />
          <InfoRow label="Role" value={isDriver ? 'Driver' : 'Passenger'}
            editing={false} placeholder="" />

          {editing && (
            <TouchableOpacity onPress={saveProfile} disabled={loading}
              style={s.saveBtn}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnText}>💾 Save Changes</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Driver Details (if driver) ── */}
        {isDriver && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🚗 Vehicle Information</Text>
            {[
              { l: 'Vehicle',       v: `${user?.driverDetails?.vehicleMake || 'Toyota'} ${user?.driverDetails?.vehicleModel || 'Corolla'}` },
              { l: 'Year',          v: user?.driverDetails?.vehicleYear    || '2020' },
              { l: 'Color',         v: user?.driverDetails?.vehicleColor   || 'White' },
              { l: 'License Plate', v: user?.driverDetails?.licensePlate   || 'ABC-1234' },
              { l: 'Verification',  v: user?.isVerified ? '✅ Verified' : '⏳ Pending Review' },
            ].map(row => (
              <View key={row.l} style={s.row}>
                <Text style={s.rowLabel}>{row.l}</Text>
                <Text style={s.rowValue}>{row.v}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Security ── */}
        <View style={s.card}>
          <TouchableOpacity onPress={() => setShowPassSec(!showPassSec)}
            style={s.cardHeader}>
            <Text style={s.cardTitle}>🔒 Change Password</Text>
            <Text style={{ color: C.rose, fontSize: 18 }}>
              {showPassSec ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {showPassSec && (
            <>
              <TextInput value={curPass} onChangeText={setCurPass}
                placeholder="Current password" secureTextEntry
                placeholderTextColor={C.muted} style={s.input} />
              <TextInput value={newPass} onChangeText={setNewPass}
                placeholder="New password (min 6 chars)" secureTextEntry
                placeholderTextColor={C.muted} style={[s.input, { marginTop: 10 }]} />
              <TextInput value={confPass} onChangeText={setConfPass}
                placeholder="Confirm new password" secureTextEntry
                placeholderTextColor={C.muted} style={[s.input, { marginTop: 10 }]} />
              <TouchableOpacity onPress={changePassword} disabled={loading}
                style={[s.saveBtn, { marginTop: 12 }]}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>Update Password</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── App mode ── */}
        {user?.role !== 'admin' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🔄 App Mode</Text>
            <TouchableOpacity onPress={() => setMode(null)} style={s.linkRow}>
              <Text style={{ fontSize: 20 }}>{mode === 'driver' ? '🚗' : '👩'}</Text>
              <Text style={s.linkText}>
                Using as {mode === 'driver' ? 'Driver' : 'Passenger'} — tap to switch
              </Text>
              <Text style={{ color: C.muted, fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Quick Links ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>⚡ Quick Actions</Text>
          {[
            { icon: '🕐', label: 'Ride History',     screen: 'RideHistory' },
            { icon: '👁️', label: 'Guardian Mode',    screen: 'GuardianSetup' },
            { icon: '💰', label: 'Wallet & Earnings', screen: 'Wallet' },
            { icon: '🔔', label: 'Notifications',     screen: 'Notifications' },
            { icon: '📍', label: 'Safe Points',       screen: 'SafePoints' },
            { icon: '🛡️', label: 'Safety Center',    screen: 'SafetyCenter' },
          ].map(item => (
            <TouchableOpacity key={item.label}
              onPress={() => navigation.navigate(item.screen)}
              style={s.linkRow}>
              <Text style={{ fontSize: 20 }}>{item.icon}</Text>
              <Text style={s.linkText}>{item.label}</Text>
              <Text style={{ color: C.muted, fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity onPress={confirmLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>🚪 Logout</Text>
        </TouchableOpacity>

        <Text style={s.versionText}>Mehfooz Ride v1.0.0 · Women's Safety First 🛡️</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Reusable info row ───────────────────────────────────────────────────────
function InfoRow({ label, value, editing, onChangeText, placeholder, keyboardType }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      {editing && onChangeText ? (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          keyboardType={keyboardType || 'default'}
          style={s.inlineInput}
        />
      ) : (
        <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: C.bg },
  header:      { padding: 24, paddingBottom: 28, alignItems: 'center' },
  backBtn:     { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 10 },
  backText:    { color: '#fff', fontWeight: '600', fontSize: 13 },
  avatarWrap:  { position: 'relative', marginBottom: 10 },
  avatar:      { width: 86, height: 86, borderRadius: 43, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  verifiedBadge: { position: 'absolute', bottom: 0, right: -4, backgroundColor: '#fff', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  headerName:  { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  headerRole:  { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 14 },
  statsRow:    { flexDirection: 'row', gap: 10 },
  statBox:     { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 10, alignItems: 'center' },
  statVal:     { color: '#fff', fontSize: 15, fontWeight: '800' },
  statLbl:     { color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2 },
  body:        { flex: 1, padding: 14 },
  card:        { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle:   { fontSize: 13, fontWeight: '700', color: C.text },
  editBtn:     { backgroundColor: C.rosePale, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  editBtnText: { color: C.rose, fontWeight: '600', fontSize: 12 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel:    { fontSize: 12, color: C.muted, flex: 1 },
  rowValue:    { fontSize: 12, color: C.text, fontWeight: '600', flex: 2, textAlign: 'right' },
  inlineInput: { flex: 2, borderWidth: 1.5, borderColor: C.rose, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: C.text, textAlign: 'right' },
  input:       { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 12, fontSize: 13, color: C.text, backgroundColor: C.bg },
  saveBtn:     { backgroundColor: C.rose, borderRadius: 14, padding: 13, alignItems: 'center', marginTop: 14 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  linkRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  linkText:    { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },
  logoutBtn:   { backgroundColor: C.dangerBg, borderRadius: 16, padding: 15, alignItems: 'center', marginBottom: 12, borderWidth: 1.5, borderColor: `${C.danger}40` },
  logoutText:  { color: C.danger, fontWeight: '700', fontSize: 14 },
  versionText: { textAlign: 'center', fontSize: 11, color: C.muted, marginBottom: 8 },
});
