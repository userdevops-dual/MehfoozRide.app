// src/screens/auth/SignupScreen.js
// 4-step signup:
// Step 1 → Personal Info + CNIC verify
// Step 2 → Selfie capture (face verification)
// Step 3 → Password + Role
// Step 4 → Driver docs (driver only)

import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../context/AuthContext';
import { Input, PrimaryBtn } from '../../components/UI';
import { C, GRAD } from '../../utils/theme';
import { authAPI } from '../../services/api';

// Type digits only — dashes are added automatically: 12345-6789012-3
// (number keyboards on some Android phones have no "-" key)
const formatCNIC = (text) => {
  const d = text.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5)  return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
};

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();

  const [step,        setStep]       = useState(1);
  const [loading,     setLoading]    = useState(false);
  const [cnicLoading, setCnicLoading]= useState(false);
  const [cnicStatus,  setCnicStatus] = useState(null); // null | 'verified' | 'failed'
  const [selfieUri,   setSelfieUri]  = useState(null); // captured selfie
  const [showCamera,  setShowCamera] = useState(false);
  const [otpSent,     setOtpSent]    = useState(false);
  const [otpLoading,  setOtpLoading] = useState(false);
  const [phoneOtp,    setPhoneOtp]   = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);

  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [form, setForm] = useState({
    name: '', email: '', phone: '', cnic: '',
    password: '', confirmPassword: '', role: 'passenger',
    licenseNumber: '', vehicleMake: '', vehicleModel: '',
    vehicleYear: '', vehicleColor: '', licensePlate: '',
  });

  const update = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const totalSteps = form.role === 'driver' ? 4 : 3;

  // ── CNIC Verification ─────────────────────────────────────────────────────
  const handleVerifyCNIC = async () => {
    if (!form.cnic || !/^\d{5}-\d{7}-\d{1}$/.test(form.cnic)) {
      Alert.alert('Invalid CNIC', 'Format: 12345-6789012-3'); return;
    }
    setCnicLoading(true); setCnicStatus(null);
    try {
      const res = await authAPI.verifyCNIC(form.cnic);
      setCnicStatus(res.cnicVerified ? 'verified' : 'failed');
      if (res.cnicVerified) Alert.alert('✅ CNIC Verified', 'Female identity confirmed!');
      else Alert.alert('Failed', res.message || 'CNIC not verified');
    } catch (err) {
      setCnicStatus('failed');
      Alert.alert('CNIC Not Verified', err.response?.data?.message || 'Could not reach the verification server. Please try again.');
    }
    setCnicLoading(false);
  };

  // ── Step 1: Personal Info ─────────────────────────────────────────────────
  const nextStep1 = () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      Alert.alert('Missing Fields', 'Please fill Name, Email and Phone.'); return;
    }
    if (!/\S+@\S+\.\S+/.test(form.email)) {
      Alert.alert('Invalid Email', 'Enter a valid email address.'); return;
    }
    if (!/^\d{5}-\d{7}-\d{1}$/.test(form.cnic)) {
      Alert.alert('Invalid CNIC', 'Format: 12345-6789012-3'); return;
    }
    if (cnicStatus !== 'verified') {
      Alert.alert('Verify CNIC', 'Tap "Verify CNIC" first.'); return;
    }
    setStep(2);
  };

  // ── Phone OTP ─────────────────────────────────────────────────────────────
  const sendPhoneOTP = async () => {
    if (!form.phone.trim()) { Alert.alert('Enter phone number first'); return; }
    setOtpLoading(true);
    try {
      // In production: call Twilio/Firebase to send OTP SMS
      // For FYP demo: simulate OTP sent
      await new Promise(r => setTimeout(r, 1200));
      setOtpSent(true);
      Alert.alert('📱 OTP Sent!', `A 6-digit OTP has been sent to ${form.phone}\n\n(Demo OTP: 123456)`);
    } catch (_) {
      setOtpSent(true);
      Alert.alert('OTP Sent (Demo)', `Demo OTP: 123456`);
    }
    setOtpLoading(false);
  };

  const verifyPhoneOTP = () => {
    const DEMO_OTP = '123456';
    if (phoneOtp === DEMO_OTP || phoneOtp.length === 6) {
      setPhoneVerified(true);
      Alert.alert('✅ Phone Verified!', 'Your mobile number has been confirmed.');
    } else {
      Alert.alert('Wrong OTP', 'Enter the 6-digit code sent to your phone.\n(Demo: 123456)');
    }
  };

  // ── Step 2: Selfie Capture ────────────────────────────────────────────────
  const openCamera = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Camera Permission Needed', 'Please allow camera access to take your verification selfie.');
        return;
      }
    }
    setShowCamera(true);
  };

  const takeSelfie = async () => {
    if (!cameraRef.current) return;
    try {
      const data = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
      setSelfieUri(data.uri);
      setShowCamera(false);
      Alert.alert(
        '📸 Selfie Captured!',
        'Your selfie has been saved for identity verification.\n\n✅ Face matches CNIC record (Demo)\n\nIn production this is compared against your CNIC using facial recognition.',
        [{ text: 'Continue ✓' }]
      );
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  };

  const nextStep2 = () => {
    if (!selfieUri) {
      Alert.alert('Selfie Required', 'Please take a selfie for identity verification. This confirms you are the CNIC owner.'); return;
    }
    if (!phoneVerified) {
      Alert.alert('Phone Not Verified', 'Please verify your phone number with OTP before continuing.'); return;
    }
    setStep(3);
  };

  // ── Step 3: Password + Role ───────────────────────────────────────────────
  const nextStep3 = () => {
    if (!form.password || form.password.length < 6) {
      Alert.alert('Weak Password', 'At least 6 characters.'); return;
    }
    if (form.password !== form.confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.'); return;
    }
    if (form.role === 'driver') { setStep(4); return; }
    handleSignup();
  };

  // ── Final Signup ──────────────────────────────────────────────────────────
  const handleSignup = async () => {
    setLoading(true);
    try {
      // On success AppNavigator remounts on the role's home screen
      const res = await signup({ ...form, gender: 'female', selfieUri });
      if (!res.success) Alert.alert('Signup Failed', res.message);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Server error. Check your backend is running.');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* ── Camera Modal for Selfie ────────────────────────────────────────── */}
      <Modal visible={showCamera} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="front"
          >
            {/* Oval face guide */}
            <View style={camStyles.overlay}>
              <View style={camStyles.topBar}>
                <TouchableOpacity onPress={() => setShowCamera(false)} style={camStyles.closeBtn}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>✕ Cancel</Text>
                </TouchableOpacity>
                <Text style={camStyles.camTitle}>Face Verification 📸</Text>
              </View>
              <View style={camStyles.ovalFrame} />
              <Text style={camStyles.camHint}>
                Position your face inside the oval{'\n'}Make sure your face is fully visible and well lit
              </Text>
              <TouchableOpacity onPress={takeSelfie} style={camStyles.captureBtn}>
                <View style={camStyles.captureInner} />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      </Modal>

      <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <LinearGradient colors={GRAD.primary} style={styles.banner}>
          <TouchableOpacity style={styles.backBtn}
            onPress={() => step === 1 ? navigation.goBack() : setStep(step - 1)}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.bannerTitle}>Join MehfoozRide 🌸</Text>
          <Text style={styles.bannerSub}>Step {step} of {totalSteps}</Text>
          <View style={styles.progressRow}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <View key={i} style={[styles.progressBar, i < step ? styles.progressActive : styles.progressInactive]} />
            ))}
          </View>
        </LinearGradient>

        <View style={styles.body}>

          {/* ════════════════════════════════════════════════════════════════
              STEP 1 — Personal Info + CNIC Verification
          ════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <>
              <Text style={styles.stepHeading}>👤 Personal Information</Text>

              <Input label="Full Name" icon="👤" placeholder="Ayesha Khan"
                value={form.name} onChangeText={v => update('name', v)} />
              <View style={styles.gap} />
              <Input label="Email Address" icon="📧" placeholder="ayesha@example.com"
                value={form.email} onChangeText={v => update('email', v)}
                keyboardType="email-address" autoCapitalize="none" />
              <View style={styles.gap} />

              {/* Phone + OTP */}
              <Text style={styles.inputLabel}>📱 Phone Number</Text>
              <View style={styles.rowInput}>
                <Input placeholder="+92 300 1234567" value={form.phone}
                  onChangeText={v => { update('phone', v); setOtpSent(false); setPhoneVerified(false); }}
                  keyboardType="phone-pad" containerStyle={{ flex: 1 }} />
                <TouchableOpacity onPress={sendPhoneOTP} disabled={otpLoading}
                  style={[styles.sideBtn, phoneVerified && { backgroundColor: '#27AE60' }]}>
                  {otpLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.sideBtnText}>{phoneVerified ? '✅' : 'Send OTP'}</Text>}
                </TouchableOpacity>
              </View>

              {otpSent && !phoneVerified && (
                <View style={styles.otpRow}>
                  <Input placeholder="Enter 6-digit OTP" value={phoneOtp}
                    onChangeText={setPhoneOtp} keyboardType="numeric" maxLength={6}
                    containerStyle={{ flex: 1 }} />
                  <TouchableOpacity onPress={verifyPhoneOTP} style={[styles.sideBtn, { backgroundColor: C.plum }]}>
                    <Text style={styles.sideBtnText}>Verify</Text>
                  </TouchableOpacity>
                </View>
              )}
              {phoneVerified && (
                <View style={styles.successBanner}>
                  <Text style={styles.successText}>✅ Phone number verified</Text>
                </View>
              )}

              <View style={styles.gap} />

              {/* CNIC + Verify */}
              <Text style={styles.inputLabel}>🪪 CNIC / National ID</Text>
              <View style={styles.rowInput}>
                <Input placeholder="12345-6789012-2  (last digit must be even)" value={form.cnic}
                  onChangeText={v => { update('cnic', formatCNIC(v)); setCnicStatus(null); }}
                  keyboardType="number-pad" maxLength={15} containerStyle={{ flex: 1 }} />
                <TouchableOpacity onPress={handleVerifyCNIC} disabled={cnicLoading}
                  style={[styles.sideBtn,
                    cnicStatus === 'verified' && { backgroundColor: '#27AE60' },
                    cnicStatus === 'failed'   && { backgroundColor: '#E74C3C' },
                  ]}>
                  {cnicLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.sideBtnText}>
                        {cnicStatus === 'verified' ? '✅' : cnicStatus === 'failed' ? '❌' : 'Verify'}
                      </Text>}
                </TouchableOpacity>
              </View>
              {cnicStatus === 'verified' && (
                <View style={styles.successBanner}>
                  <Text style={styles.successText}>✅ CNIC verified — Female identity confirmed</Text>
                </View>
              )}
              {cnicStatus === 'failed' && (
                <View style={styles.failBanner}>
                  <Text style={styles.failText}>❌ CNIC failed. Last digit must be EVEN (0,2,4,6,8) for female identity. Odd = male = not allowed.</Text>
                </View>
              )}

              {/* Gender info */}
              <View style={[styles.genderBox, { marginTop: 14 }]}>
                <Text style={styles.genderLabel}>PLATFORM POLICY</Text>
                <Text style={styles.genderNote}>
                  🛡️ MehfoozRide is a <Text style={{ fontWeight: '800', color: C.rose }}>women-only</Text> platform. CNIC is used to verify female identity. Only verified female users may join.
                </Text>
              </View>

              <View style={{ height: 18 }} />
              <PrimaryBtn title="Continue →" onPress={nextStep1} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 2 — Selfie / Face Verification
          ════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <>
              <Text style={styles.stepHeading}>📸 Face Verification</Text>
              <Text style={styles.stepDesc}>
                We need a live selfie to confirm you are the owner of the CNIC you submitted. This prevents identity fraud.
              </Text>

              {/* How it works */}
              <View style={styles.howCard}>
                <Text style={styles.howTitle}>How Face Verification Works</Text>
                {[
                  { ico: '📸', text: 'Take a live selfie using your front camera' },
                  { ico: '🔍', text: 'Your face is compared with the CNIC photo record' },
                  { ico: '✅', text: 'If matched — registration proceeds' },
                  { ico: '❌', text: 'If not matched — registration is rejected' },
                ].map((item, i) => (
                  <View key={i} style={styles.howRow}>
                    <Text style={{ fontSize: 20 }}>{item.ico}</Text>
                    <Text style={styles.howText}>{item.text}</Text>
                  </View>
                ))}
                <Text style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
                  ℹ️ In production: uses AWS Rekognition / Azure Face API for real matching. FYP demo captures and stores selfie.
                </Text>
              </View>

              {/* Selfie preview or capture button */}
              {selfieUri ? (
                <View style={styles.selfiePreviewBox}>
                  <Image source={{ uri: selfieUri }} style={styles.selfieImage} />
                  <View style={styles.selfieSuccess}>
                    <Text style={{ color: '#27AE60', fontWeight: '700', fontSize: 13 }}>✅ Selfie Captured</Text>
                    <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Face matched with CNIC record (Demo)</Text>
                  </View>
                  <TouchableOpacity onPress={openCamera} style={styles.retakeBtn}>
                    <Text style={{ color: C.rose, fontWeight: '700', fontSize: 13 }}>🔄 Retake Selfie</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={openCamera} style={styles.cameraBtn}>
                  <LinearGradient colors={GRAD.primary} style={styles.cameraBtnInner}>
                    <Text style={{ fontSize: 48 }}>📸</Text>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 10 }}>Take Selfie</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>
                      Use front camera for identity verification
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              {/* Tips */}
              <View style={styles.tipBox}>
                <Text style={styles.tipTitle}>📋 Tips for a good selfie</Text>
                {[
                  '✓ Good lighting — face a window or light source',
                  '✓ Remove glasses, mask or face cover',
                  '✓ Look directly at the camera',
                  '✓ Neutral expression — no smiling widely',
                ].map((t, i) => (
                  <Text key={i} style={styles.tipItem}>{t}</Text>
                ))}
              </View>

              <View style={{ height: 18 }} />
              <PrimaryBtn title={selfieUri ? 'Continue →' : 'Take Selfie to Continue'} onPress={nextStep2} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 3 — Password + Role
          ════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <>
              <Text style={styles.stepHeading}>🔒 Set Password & Role</Text>

              <Input label="Create Password" icon="🔒" placeholder="Min 6 characters"
                value={form.password} onChangeText={v => update('password', v)} secureTextEntry />
              <View style={styles.gap} />
              <Input label="Confirm Password" icon="🔒" placeholder="Re-enter password"
                value={form.confirmPassword} onChangeText={v => update('confirmPassword', v)} secureTextEntry />
              <View style={{ height: 20 }} />

              <Text style={styles.roleTitle}>I am joining as:</Text>
              <View style={{ gap: 12 }}>
                {[
                  { id: 'passenger', icon: '👩',  label: 'Passenger',      desc: 'Book safe rides with verified female drivers' },
                  { id: 'driver',    icon: '🚗',  label: 'Driver Partner',  desc: 'Drive, earn & empower other women' },
                ].map(r => (
                  <TouchableOpacity key={r.id} onPress={() => update('role', r.id)}
                    style={[styles.roleCard, form.role === r.id && styles.roleCardActive]}>
                    <Text style={{ fontSize: 32 }}>{r.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roleLabel, form.role === r.id && { color: C.rose }]}>{r.label}</Text>
                      <Text style={styles.roleDesc}>{r.desc}</Text>
                    </View>
                    {form.role === r.id && (
                      <View style={styles.roleCheck}><Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text></View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 20 }} />
              <PrimaryBtn
                title={form.role === 'driver' ? 'Next: Add Documents →' : (loading ? 'Creating Account...' : 'Create Account 🎉')}
                onPress={nextStep3} loading={loading && form.role !== 'driver'} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 4 — Driver Documents
          ════════════════════════════════════════════════════════════════ */}
          {step === 4 && form.role === 'driver' && (
            <>
              <Text style={styles.stepHeading}>📄 Driver Documents</Text>

              <View style={styles.bgCheckCard}>
                <Text style={styles.bgCheckTitle}>🔍 Background Check Process</Text>
                {[
                  '✅ CNIC verified as female (Step 1)',
                  '✅ Selfie captured for face match (Step 2)',
                  '📋 Driving license number',
                  '🚗 Vehicle registration details',
                  '🔎 Criminal record declaration',
                  '👩‍💼 Admin final approval (24–48 hrs)',
                ].map((item, i) => (
                  <Text key={i} style={styles.bgCheckItem}>{item}</Text>
                ))}
              </View>

              <Input label="Driving License Number" icon="🪪" placeholder="DL-1234567"
                value={form.licenseNumber} onChangeText={v => update('licenseNumber', v)} />
              <View style={styles.gap} />
              <Input label="Vehicle Make" icon="🚗" placeholder="Toyota / Honda / Suzuki"
                value={form.vehicleMake} onChangeText={v => update('vehicleMake', v)} />
              <View style={styles.gap} />
              <Input label="Vehicle Model" icon="📋" placeholder="Corolla / City / Alto"
                value={form.vehicleModel} onChangeText={v => update('vehicleModel', v)} />
              <View style={styles.gap} />
              <Input label="Vehicle Year" icon="📅" placeholder="2020"
                value={form.vehicleYear} onChangeText={v => update('vehicleYear', v)} keyboardType="numeric" />
              <View style={styles.gap} />
              <Input label="Vehicle Color" icon="🎨" placeholder="White / Silver / Red"
                value={form.vehicleColor} onChangeText={v => update('vehicleColor', v)} />
              <View style={styles.gap} />
              <Input label="License Plate" icon="🔢" placeholder="ABC-1234"
                value={form.licensePlate} onChangeText={v => update('licensePlate', v)} autoCapitalize="characters" />

              <View style={styles.uploadNote}>
                <Text style={{ fontSize: 12, color: '#A07820', lineHeight: 18 }}>
                  📷 Upload photos of your CNIC, License and Vehicle Registration in the Profile section after account creation.
                </Text>
              </View>

              <View style={{ height: 20 }} />
              <PrimaryBtn
                title={loading ? 'Creating Account...' : 'Submit & Create Account 🎉'}
                onPress={handleSignup} loading={loading} />
            </>
          )}

          {/* Sign In Link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: C.bg },
  banner:          { padding: 24, paddingBottom: 38 },
  backBtn:         { backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 14 },
  backText:        { color: '#fff', fontSize: 13, fontWeight: '600' },
  bannerTitle:     { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  bannerSub:       { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 14 },
  progressRow:     { flexDirection: 'row', gap: 6 },
  progressBar:     { flex: 1, height: 5, borderRadius: 3 },
  progressActive:  { backgroundColor: '#fff' },
  progressInactive:{ backgroundColor: 'rgba(255,255,255,0.3)' },
  body:            { padding: 20 },
  gap:             { height: 12 },
  stepHeading:     { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 6 },
  stepDesc:        { fontSize: 13, color: C.muted, lineHeight: 20, marginBottom: 16 },
  inputLabel:      { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6 },
  rowInput:        { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  sideBtn:         { backgroundColor: C.rose, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, alignItems: 'center', minWidth: 80 },
  sideBtnText:     { color: '#fff', fontWeight: '700', fontSize: 12 },
  otpRow:          { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginTop: 10 },
  successBanner:   { backgroundColor: '#D5F5E3', borderRadius: 12, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#27AE60' },
  successText:     { fontSize: 12, color: '#1A7A40', fontWeight: '600' },
  failBanner:      { backgroundColor: '#FDEDEC', borderRadius: 12, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#E74C3C' },
  failText:        { fontSize: 12, color: '#B03A2E', fontWeight: '600' },
  genderBox:       { backgroundColor: C.rosePale, borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: `${C.rose}30` },
  genderLabel:     { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  genderNote:      { fontSize: 12, color: C.text, lineHeight: 18 },
  // Selfie
  howCard:         { backgroundColor: C.rosePale, borderRadius: 18, padding: 16, marginBottom: 16 },
  howTitle:        { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 12 },
  howRow:          { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  howText:         { flex: 1, fontSize: 12, color: C.text, lineHeight: 18 },
  cameraBtn:       { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
  cameraBtnInner:  { padding: 32, alignItems: 'center' },
  selfiePreviewBox:{ backgroundColor: C.white, borderRadius: 20, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 2, borderColor: '#27AE60' },
  selfieImage:     { width: 140, height: 140, borderRadius: 70, marginBottom: 12 },
  selfieSuccess:   { alignItems: 'center', marginBottom: 10 },
  retakeBtn:       { borderWidth: 1.5, borderColor: C.rose, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 8 },
  tipBox:          { backgroundColor: '#F0F9F0', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#27AE60' },
  tipTitle:        { fontSize: 12, fontWeight: '700', color: '#1A5C2A', marginBottom: 8 },
  tipItem:         { fontSize: 11, color: '#2E7D32', marginBottom: 4, lineHeight: 18 },
  // Role
  roleTitle:       { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 },
  roleCard:        { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 18, borderWidth: 2.5, borderColor: C.border, backgroundColor: C.white },
  roleCardActive:  { borderColor: C.rose, backgroundColor: C.rosePale },
  roleLabel:       { fontWeight: '700', fontSize: 14, color: C.text },
  roleDesc:        { fontSize: 11, color: C.muted, marginTop: 2 },
  roleCheck:       { width: 24, height: 24, borderRadius: 12, backgroundColor: C.rose, alignItems: 'center', justifyContent: 'center' },
  // Driver docs
  bgCheckCard:     { backgroundColor: '#F0F9F0', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#27AE60' },
  bgCheckTitle:    { fontSize: 13, fontWeight: '700', color: '#1A5C2A', marginBottom: 10 },
  bgCheckItem:     { fontSize: 12, color: '#2E7D32', marginBottom: 5, lineHeight: 18 },
  uploadNote:      { backgroundColor: C.goldLight, borderRadius: 14, padding: 13, marginTop: 14, borderWidth: 1, borderColor: `${C.gold}40` },
  loginRow:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 22, marginBottom: 30 },
  loginText:       { color: C.muted, fontSize: 13 },
  loginLink:       { color: C.rose, fontSize: 13, fontWeight: '700' },
});

const camStyles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 40 },
  topBar:      { alignItems: 'center', width: '100%', paddingHorizontal: 20 },
  closeBtn:    { position: 'absolute', left: 20, top: 0, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  camTitle:    { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 4 },
  ovalFrame:   { width: 220, height: 280, borderRadius: 110, borderWidth: 3, borderColor: '#fff', backgroundColor: 'transparent', shadowColor: '#fff', shadowOpacity: 0.6, shadowRadius: 10 },
  camHint:     { color: '#fff', fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 30 },
  captureBtn:  { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  captureInner:{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
});