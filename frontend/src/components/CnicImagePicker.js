// src/components/CnicImagePicker.js
// One CNIC side (front or back): take a photo or choose from the gallery,
// preview it, replace it or remove it. The picked image stays on the phone
// until signup uploads it to the server's private storage.
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../utils/theme';

const MAX_BYTES = 5 * 1024 * 1024; // same limit as the server

const PICK_OPTIONS = {
  mediaTypes: ['images'],
  allowsEditing: true,        // lets the user crop to the card
  aspect: [16, 10],
  quality: 0.7,               // keeps uploads small
};

const permissionDenied = (what) =>
  Alert.alert(
    `${what} permission needed`,
    `Mehfooz Ride needs ${what.toLowerCase()} access to add your CNIC photo. You can allow it in Settings.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]
  );

export default function CnicImagePicker({ label, image, onChange }) {
  const [busy, setBusy] = useState(false);

  const pick = async (source) => {
    setBusy(true);
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { permissionDenied(source === 'camera' ? 'Camera' : 'Photos'); return; }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICK_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_BYTES) {
        Alert.alert('Photo too large', 'Please choose a photo smaller than 5 MB.'); return;
      }
      onChange({ uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg', fileName: asset.fileName, width: asset.width, height: asset.height });
    } catch (e) {
      Alert.alert('Could not add photo', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const choose = () =>
    Alert.alert(label, 'Add a clear photo of your CNIC', [
      { text: '📷 Take Photo',  onPress: () => pick('camera') },
      { text: '🖼️ Choose from Gallery', onPress: () => pick('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const remove = () =>
    Alert.alert('Remove photo?', `Remove the ${label.toLowerCase()}?`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onChange(null) },
    ]);

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      {image ? (
        <View>
          <Image source={{ uri: image.uri }} style={s.preview} resizeMode="cover" />
          <View style={s.row}>
            <TouchableOpacity onPress={choose} style={[s.btn, s.btnReplace]} disabled={busy}>
              <Text style={s.btnReplaceText}>🔄 Replace</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={remove} style={[s.btn, s.btnRemove]} disabled={busy}>
              <Text style={s.btnRemoveText}>🗑️ Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={choose} style={s.empty} disabled={busy}>
          {busy
            ? <ActivityIndicator color={C.rose} />
            : <>
                <Text style={{ fontSize: 30 }}>🪪</Text>
                <Text style={s.emptyTitle}>Add {label}</Text>
                <Text style={s.emptySub}>Take a photo or choose from gallery</Text>
              </>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:           { marginBottom: 14 },
  label:          { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 6 },
  empty:          { height: 130, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: C.rose, backgroundColor: C.rosePale, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:     { fontSize: 14, fontWeight: '700', color: C.rose, marginTop: 6 },
  emptySub:       { fontSize: 11, color: C.muted, marginTop: 2 },
  preview:        { width: '100%', height: 170, borderRadius: 16, backgroundColor: '#eee' },
  row:            { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn:            { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5 },
  btnReplace:     { borderColor: C.rose, backgroundColor: C.white },
  btnReplaceText: { color: C.rose, fontWeight: '700', fontSize: 13 },
  btnRemove:      { borderColor: '#E74C3C', backgroundColor: '#FFF5F5' },
  btnRemoveText:  { color: '#E74C3C', fontWeight: '700', fontSize: 13 },
});
