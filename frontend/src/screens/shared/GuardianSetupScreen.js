// src/screens/shared/GuardianSetupScreen.js
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, TextInput, Switch,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { C, GRAD } from '../../utils/theme';

export default function GuardianSetupScreen({ navigation }) {
  const { user, updateUser } = useAuth();

  const [contacts, setContacts] = useState(
    user?.guardianContacts?.length > 0
      ? user.guardianContacts
      : [
          { name: '', phone: '', isActive: false },
          { name: '', phone: '', isActive: false },
        ]
  );
  const [guardianOn, setGuardianOn] = useState(
    user?.guardianContacts?.some(c => c.isActive) || false
  );
  const [saving, setSaving] = useState(false);

  const updateContact = (index, field, value) => {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    setContacts(updated);
  };

  const addContact = () => {
    if (contacts.length >= 3) {
      Alert.alert('Max 3', 'You can add up to 3 guardian contacts.');
      return;
    }
    setContacts([...contacts, { name: '', phone: '', isActive: false }]);
  };

  const removeContact = (index) => {
    if (contacts.length === 1) return;
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const filled = contacts.filter(c => c.name.trim() && c.phone.trim());
    if (filled.length === 0) {
      Alert.alert('Add a contact', 'Please add at least one guardian contact.');
      return;
    }
    setSaving(true);
    try {
      const activeContacts = filled.map(c => ({ ...c, isActive: guardianOn }));
      const res = await authAPI.updateProfile({ guardianContacts: activeContacts });
      if (res.success) {
        updateUser({ guardianContacts: activeContacts });
        Alert.alert('Saved!', 'Guardian contacts updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e) {
      // Demo mode
      const activeContacts = filled.map(c => ({ ...c, isActive: guardianOn }));
      updateUser({ guardianContacts: activeContacts });
      Alert.alert('Saved!', 'Guardian contacts saved.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
    setSaving(false);
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <LinearGradient colors={GRAD.primary} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: '#fff', fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Guardian Mode 👁️</Text>
          <Text style={styles.headerSub}>Your trusted contacts who track your rides</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Guardian Mode Toggle */}
        <View style={styles.toggleCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>
              {guardianOn ? '🟢 Guardian Mode ON' : '🔴 Guardian Mode OFF'}
            </Text>
            <Text style={styles.toggleDesc}>
              {guardianOn
                ? 'Your contacts will be notified at every ride start'
                : 'Enable to auto-share rides with your contacts'}
            </Text>
          </View>
          <Switch
            value={guardianOn}
            onValueChange={setGuardianOn}
            trackColor={{ false: C.border, true: C.rose }}
            thumbColor="#fff"
          />
        </View>

        {/* How it works */}
        <View style={styles.howCard}>
          <Text style={styles.sectionTitle}>🛡️ How Guardian Mode Works</Text>
          {[
            'When you book a ride, contacts are notified automatically',
            'They receive your live location + driver details',
            'SOS alerts are sent instantly to all active contacts',
            'Contacts don\'t need the app installed',
          ].map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={styles.tipNum}><Text style={{ color: C.rose, fontSize: 11, fontWeight: '700' }}>{i + 1}</Text></View>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        {/* Contacts */}
        <Text style={styles.sectionTitle}>👩‍👧 Trusted Contacts ({contacts.length}/3)</Text>

        {contacts.map((contact, i) => (
          <View key={i} style={styles.contactCard}>
            <View style={styles.contactHeader}>
              <View style={styles.contactAvatar}>
                <Text style={{ fontSize: 20 }}>{['👩', '👩‍👧', '👭'][i] || '👤'}</Text>
              </View>
              <Text style={styles.contactNum}>Contact {i + 1}</Text>
              {contacts.length > 1 && (
                <TouchableOpacity onPress={() => removeContact(i)} style={styles.removeBtn}>
                  <Text style={{ color: C.danger, fontSize: 12, fontWeight: '700' }}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                value={contact.name}
                onChangeText={v => updateContact(i, 'name', v)}
                placeholder="e.g. Ammi, Baji Sara"
                placeholderTextColor={C.muted}
                style={styles.input}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                value={contact.phone}
                onChangeText={v => updateContact(i, 'phone', v)}
                placeholder="+92 300 1234567"
                placeholderTextColor={C.muted}
                keyboardType="phone-pad"
                style={styles.input}
              />
            </View>
          </View>
        ))}

        {contacts.length < 3 && (
          <TouchableOpacity onPress={addContact} style={styles.addBtn}>
            <Text style={{ color: C.rose, fontWeight: '700', fontSize: 14 }}>+ Add Another Contact</Text>
          </TouchableOpacity>
        )}

        {/* Save */}
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
          <LinearGradient colors={GRAD.primary} style={styles.saveBtnInner}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
              {saving ? 'Saving...' : '💾 Save Guardian Contacts'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: C.bg },
  header:        { padding: 20, paddingTop: 50, paddingBottom: 24 },
  backBtn:       { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitle:   { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub:     { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  content:       { padding: 16, gap: 14 },
  toggleCard:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.white, borderRadius: 18, padding: 18, borderWidth: 1.5, borderColor: C.border },
  toggleTitle:   { fontSize: 14, fontWeight: '700', color: C.text },
  toggleDesc:    { fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 16 },
  howCard:       { backgroundColor: C.rosePale, borderRadius: 18, padding: 16 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 12, marginTop: 4 },
  tipRow:        { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 },
  tipNum:        { width: 20, height: 20, borderRadius: 10, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  tipText:       { flex: 1, fontSize: 12, color: C.text, lineHeight: 18 },
  contactCard:   { backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, gap: 10 },
  contactHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  contactAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.rosePale, alignItems: 'center', justifyContent: 'center' },
  contactNum:    { flex: 1, fontSize: 13, fontWeight: '700', color: C.text },
  removeBtn:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: C.danger },
  inputGroup:    { gap: 5 },
  inputLabel:    { fontSize: 11, fontWeight: '600', color: C.muted },
  input:         { backgroundColor: C.bg, borderRadius: 12, padding: 12, fontSize: 13, color: C.text, borderWidth: 1, borderColor: C.border },
  addBtn:        { borderRadius: 16, borderWidth: 1.5, borderColor: C.rose, borderStyle: 'dashed', padding: 16, alignItems: 'center' },
  saveBtn:       { borderRadius: 18, overflow: 'hidden' },
  saveBtnInner:  { padding: 18, alignItems: 'center' },
});
// NOTE: Auto-notify events (ride booked, driver assigned, ride started, completed, SOS, route deviation)
// are triggered server-side in rideController.js and socket.js — no extra frontend code needed.
