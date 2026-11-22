// src/screens/driver/DriverDocumentsScreen.js
// Driver's verification documents: driving licence photo, vehicle registration
// certificate photo, profile photo, and licence/vehicle details. Photos go to
// the server's private storage; only admins can view the licence and
// registration photos. Changing licence or vehicle details sends an approved
// driver back to admin review.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import CnicImagePicker from '../../components/CnicImagePicker';
import { Input } from '../../components/UI';
import { driverAPI, authImage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { C, GRAD } from '../../utils/theme';

const errMsg = (e) => e?.response?.data?.message || (e?.request && !e?.response ? 'Cannot reach the server. Check your connection.' : 'Could not save. Please try again.');

const CHECK_LABEL = {
  cnic: 'CNIC (from signup)', documents: 'Licence + registration photos', vehicle: 'Vehicle details',
  backgroundCheck: 'Background check (admin)', adminApproved: 'Admin approval',
};

export default function DriverDocumentsScreen({ navigation }) {
  const { user } = useAuth();
  const [docs, setDocs]       = useState(null);
  const [verification, setVerification] = useState(null);
  const [error, setError]     = useState(null);
  const [saving, setSaving]   = useState(false);
  const [files, setFiles]     = useState({ licensePhoto: null, registrationPhoto: null, profilePhoto: null });
  const [form, setForm]       = useState(null);    // licence/vehicle text, filled from the server

  const load = async () => {
    try {
      setError(null);
      const res = await driverAPI.getDocuments();
      setDocs(res.documents); setVerification(res.verification);
      setForm(f => f || {
        licenseNumber: res.documents.licenseNumber, licensePlate: res.documents.licensePlate,
        vehicleMake: res.documents.vehicleMake, vehicleModel: res.documents.vehicleModel,
        vehicleYear: res.documents.vehicleYear, vehicleColor: res.documents.vehicleColor,
      });
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { load(); }, []);

  const changedText = form && docs ? Object.keys(form).filter(k => (form[k] || '') !== (docs[k] || '')) : [];
  const pickedFiles = Object.fromEntries(Object.entries(files).filter(([, v]) => v));
  const dirty = changedText.length > 0 || Object.keys(pickedFiles).length > 0;

  const save = async () => {
    if (!form.licenseNumber?.trim() || !form.licensePlate?.trim() || !form.vehicleMake?.trim() || !form.vehicleModel?.trim()) {
      Alert.alert('Details required', 'Licence number, number plate, vehicle make and model are required.'); return;
    }
    const doSave = async () => {
      setSaving(true);
      try {
        const fields = Object.fromEntries(changedText.map(k => [k, form[k]]));
        const res = await driverAPI.uploadDocuments(pickedFiles, fields);
        setDocs(res.documents); setVerification(res.verification);
        setFiles({ licensePhoto: null, registrationPhoto: null, profilePhoto: null });
        Alert.alert('Saved', res.message || 'Your documents were saved.');
      } catch (e) { Alert.alert('Not saved', errMsg(e)); }
      setSaving(false);
    };
    const reReview = docs?.isVerified && (changedText.some(k => k !== 'vehicleColor') || pickedFiles.licensePhoto || pickedFiles.registrationPhoto);
    if (reReview) {
      Alert.alert('Send for review again?', 'You are approved. Changing your licence or vehicle means an admin must review you again, and you cannot go online until then.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Yes, save', onPress: doSave },
      ]);
    } else doSave();
  };

  if (!docs || !form) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        {error ? <><Text style={s.err}>{error}</Text><TouchableOpacity onPress={load}><Text style={s.link}>Try again</Text></TouchableOpacity></>
               : <ActivityIndicator color={C.rose} size="large" />}
      </View>
    );
  }

  const Status = ({ ok, label }) => (
    <Text style={[s.status, { color: ok ? C.success : C.muted }]}>{ok ? '✓ Uploaded' : `○ ${label || 'Not uploaded yet'}`}</Text>
  );

  return (
    <View style={s.screen}>
      <LinearGradient colors={GRAD.primary} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>📄 My Documents</Text>
        <Text style={s.sub}>{verification?.verified ? '✅ Verified Female Driver' : docs.isVerified ? 'Approved — documents incomplete' : '⏳ Waiting for admin review'}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {/* What is still missing */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Verification checklist</Text>
          {Object.entries(CHECK_LABEL).map(([k, l]) => (
            <Text key={k} style={[s.check, { color: verification?.checks?.[k] ? C.success : C.muted }]}>
              {verification?.checks?.[k] ? '✓' : '○'} {l}
            </Text>
          ))}
          {verification?.isDemo && <Text style={s.small}>🧪 Demo account</Text>}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>👤 Profile photo</Text>
          <Text style={s.small}>Passengers see this when you accept their ride.</Text>
          {docs.profilePhoto && !files.profilePhoto && user?._id && (
            <Image source={authImage(`/api/driver/${user._id}/photo`)} style={s.avatar} />
          )}
          <Status ok={docs.profilePhoto} />
          <CnicImagePicker label={docs.profilePhoto ? 'Replace profile photo' : 'Profile photo'} aspect={[1, 1]}
            image={files.profilePhoto} onChange={img => setFiles(f => ({ ...f, profilePhoto: img }))} />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>🪪 Driving licence</Text>
          <Text style={s.small}>Only admins can see this photo.</Text>
          <Status ok={docs.licensePhoto} />
          <CnicImagePicker label={docs.licensePhoto ? 'Replace licence photo' : 'Driving licence photo'}
            image={files.licensePhoto} onChange={img => setFiles(f => ({ ...f, licensePhoto: img }))} />
          <Input label="Licence number" icon="🪪" placeholder="DL-1234567" value={form.licenseNumber}
            onChangeText={v => setForm(f => ({ ...f, licenseNumber: v }))} />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>🚗 Vehicle registration certificate</Text>
          <Text style={s.small}>Only admins can see this photo.</Text>
          <Status ok={docs.registrationPhoto} />
          <CnicImagePicker label={docs.registrationPhoto ? 'Replace registration photo' : 'Registration certificate photo'}
            image={files.registrationPhoto} onChange={img => setFiles(f => ({ ...f, registrationPhoto: img }))} />
          <Input label="Number plate" icon="🔢" placeholder="LEA-1234" autoCapitalize="characters" value={form.licensePlate}
            onChangeText={v => setForm(f => ({ ...f, licensePlate: v }))} />
          <View style={{ height: 8 }} />
          <Input label="Make" icon="🚗" placeholder="Suzuki" value={form.vehicleMake} onChangeText={v => setForm(f => ({ ...f, vehicleMake: v }))} />
          <View style={{ height: 8 }} />
          <Input label="Model" icon="📋" placeholder="Cultus" value={form.vehicleModel} onChangeText={v => setForm(f => ({ ...f, vehicleModel: v }))} />
          <View style={{ height: 8 }} />
          <Input label="Year" icon="📅" placeholder="2020" keyboardType="numeric" maxLength={4} value={form.vehicleYear} onChangeText={v => setForm(f => ({ ...f, vehicleYear: v }))} />
          <View style={{ height: 8 }} />
          <Input label="Colour" icon="🎨" placeholder="White" value={form.vehicleColor} onChangeText={v => setForm(f => ({ ...f, vehicleColor: v }))} />
        </View>

        <TouchableOpacity onPress={save} disabled={!dirty || saving} style={[s.save, (!dirty || saving) && { opacity: 0.5 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>{dirty ? 'Save documents' : 'No changes'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: C.bg },
  header:    { padding: 20, paddingTop: 46, paddingBottom: 20 },
  back:      { color: '#fff', fontSize: 14, marginBottom: 8 },
  title:     { color: '#fff', fontSize: 22, fontWeight: '900' },
  sub:       { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
  card:      { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  small:     { fontSize: 11, color: C.muted },
  check:     { fontSize: 12, fontWeight: '600' },
  status:    { fontSize: 12, fontWeight: '700' },
  avatar:    { width: 90, height: 90, borderRadius: 45, alignSelf: 'center', marginVertical: 6, backgroundColor: C.border },
  save:      { backgroundColor: C.rose, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  saveText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  err:       { color: C.text, textAlign: 'center', marginBottom: 10 },
  link:      { color: C.rose, fontWeight: '700' },
});
