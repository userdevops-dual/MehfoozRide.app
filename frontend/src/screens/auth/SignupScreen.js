// src/screens/auth/SignupScreen.js
// Signup steps:
// Step 1 → Name, email, phone + OTP (verified by the server)
// Step 2 → CNIC number (format + female eligibility) + CNIC front/back photos
// Step 3 → Selfie capture
// Step 4 → Password + role
// Step 5 → Driver details (drivers only)
// The server repeats every check at signup — the app only gives early feedback.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../context/AuthContext';
import { Input, PrimaryBtn } from '../../components/UI';
import CnicImagePicker from '../../components/CnicImagePicker';
import { C, GRAD } from '../../utils/theme';
import { authAPI } from '../../services/api';
import { formatCNIC, checkCNIC, normalizePhone, passwordRules, isEmail } from '../../utils/validation';

const errMsg = (err, fallback) =>
  err?.response?.data?.message || (err?.request && !err?.response ? 'Cannot reach the server. Check your internet connection and that the backend is running.' : fallback);

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();

  const [step,        setStep]       = useState(1);
  const [loading,     setLoading]    = useState(false);
  const [selfieUri,   setSelfieUri]  = useState(null);
  const [showCamera,  setShowCamera] = useState(false);

  // Phone OTP (server-verified)
  const [otp, setOtp] = useState({
    sending: false, sent: false, verifying: false,
    code: '', token: null, verifiedPhone: null,
    demoOtp: null, info: '', error: '', resendIn: 0,
  });
  const setO = (patch) => setOtp(p => ({ ...p, ...patch }));

  // CNIC
  const [cnicServer, setCnicServer] = useState({ state: 'idle', message: '' }); // idle | checking | ok | fail
  const [cnicImages, setCnicImages] = useState({ front: null, back: null });

  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [form, setForm] = useState({
    name: '', email: '', phone: '', cnic: '',
    password: '', confirmPassword: '', role: 'passenger',
    licenseNumber: '', vehicleMake: '', vehicleModel: '',
    vehicleYear: '', vehicleColor: '', licensePlate: '',
  });

  const update = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const totalSteps = form.role === 'driver' ? 5 : 4;

  // Resend countdown
  useEffect(() => {
    if (otp.resendIn <= 0) return;
    const t = setTimeout(() => setO({ resendIn: otp.resendIn - 1 }), 1000);
    return () => clearTimeout(t);
  }, [otp.resendIn]);

  const phoneVerified = !!otp.token && otp.verifiedPhone === normalizePhone(form.phone);
  const cnicLocal = checkCNIC(form.cnic);

  // ── Phone OTP ─────────────────────────────────────────────────────────────
  const onPhoneChange = (v) => {
    update('phone', v);
    // A different number needs a new verification
    if (otp.sent || otp.token) setO({ sent: false, code: '', token: null, verifiedPhone: null, demoOtp: null, info: '', error: '' });
  };

  const sendPhoneOTP = async () => {
    const phone = normalizePhone(form.phone);
    if (!phone) { setO({ error: 'Enter a valid Pakistani mobile number, e.g. 03001234567.' }); return; }
    setO({ sending: true, error: '', info: '' });
    try {
      const res = await authAPI.sendOTP(phone);
      setO({
        sending: false, sent: true, code: '',
        demoOtp: res.demo ? res.demoOtp : null,
        info: res.message, resendIn: res.resendInSeconds || 30,
      });
    } catch (err) {
      const retry = err?.response?.data?.retryAfterSeconds;
      setO({ sending: false, error: errMsg(err, 'Could not send the code.'), ...(retry ? { resendIn: retry, sent: true } : {}) });
    }
  };

  const verifyPhoneOTP = async () => {
    if (!/^\d{6}$/.test(otp.code)) { setO({ error: 'Enter the 6-digit code.' }); return; }
    setO({ verifying: true, error: '' });
    try {
      const res = await authAPI.verifyOTP(normalizePhone(form.phone), otp.code);
      setO({ verifying: false, token: res.phoneVerificationToken, verifiedPhone: res.phone, info: '', error: '' });
    } catch (err) {
      const d = err?.response?.data || {};
      setO({ verifying: false, code: '', error: errMsg(err, 'Could not verify the code.'), ...(d.expired || d.locked ? { sent: false, demoOtp: null } : {}) });
    }
  };

  // ── Step 1: Account ───────────────────────────────────────────────────────
  const nextStep1 = () => {
    if (form.name.trim().length < 2) { Alert.alert('Name Required', 'Please enter your full name.'); return; }
    if (!isEmail(form.email))        { Alert.alert('Invalid Email', 'Enter a valid email address.'); return; }
    if (!phoneVerified)              { Alert.alert('Verify Phone', 'Please verify your mobile number with the OTP before continuing.'); return; }
    setStep(2);
  };

  // ── Step 2: CNIC ──────────────────────────────────────────────────────────
  const onCnicChange = (v) => {
    update('cnic', formatCNIC(v));
    setCnicServer({ state: 'idle', message: '' });
  };

  // Check with the server as soon as all 13 digits are entered
  useEffect(() => {
    if (!cnicLocal.complete || !cnicLocal.valid || !cnicLocal.eligible) return;
    let cancelled = false;
    setCnicServer({ state: 'checking', message: '' });
    authAPI.verifyCNIC(form.cnic)
      .then(() => { if (!cancelled) setCnicServer({ state: 'ok', message: 'CNIC format is valid and eligible.' }); })
      .catch(err => { if (!cancelled) setCnicServer({ state: 'fail', message: errMsg(err, 'Could not check the CNIC.') }); });
    return () => { cancelled = true; };
  }, [form.cnic]);

  const nextStep2 = () => {
    if (!cnicLocal.complete || !cnicLocal.valid) { Alert.alert('Invalid CNIC', cnicLocal.message || 'Enter your 13-digit CNIC.'); return; }
    if (!cnicLocal.eligible)                     { Alert.alert('Not Eligible', cnicLocal.message); return; }
    if (cnicServer.state === 'checking')         { Alert.alert('Please wait', 'Checking your CNIC…'); return; }
    if (cnicServer.state !== 'ok')               { Alert.alert('CNIC Not Accepted', cnicServer.message || 'Your CNIC could not be checked. Please try again.'); return; }
    if (!cnicImages.front || !cnicImages.back)   { Alert.alert('CNIC Photos Required', 'Please add photos of both the front and the back of your CNIC.'); return; }
    setStep(3);
  };

  // ── Step 3: Selfie Capture ────────────────────────────────────────────────
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
        '📸 Selfie Captured',
        'Your selfie has been captured.\n\nDemo: face matching against your CNIC is not performed in this version.',
        [{ text: 'Continue ✓' }]
      );
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  };

  const nextStep3 = () => {
    if (!selfieUri) {
      Alert.alert('Selfie Required', 'Please take a selfie for identity verification.'); return;
    }
    setStep(4);
  };

  // ── Step 4: Password + Role ───────────────────────────────────────────────
  const pwRules = passwordRules(form.password);
  const nextStep4 = () => {
    if (!pwRules.every(r => r.ok)) {
      Alert.alert('Weak Password', 'Your password needs: ' + pwRules.filter(r => !r.ok).map(r => r.label.toLowerCase()).join(', ') + '.'); return;
    }
    if (form.password !== form.confirmPassword) {
      Alert.alert('Passwords Do Not Match', 'Please re-enter the same password in both fields.'); return;
    }
    if (form.role === 'driver') { setStep(5); return; }
    handleSignup();
  };

  // ── Final Signup ──────────────────────────────────────────────────────────
  const handleSignup = async () => {
    setLoading(true);
    try {
      const { confirmPassword, ...fields } = form;
      // On success AppNavigator remounts on the role's home screen
      const res = await signup(
        { ...fields, phone: normalizePhone(form.phone), phoneVerificationToken: otp.token },
        cnicImages
      );
      if (!res.success) Alert.alert('Signup Failed', res.message);
    } catch (err) {
      const d = err?.response?.data || {};
      Alert.alert('Signup Failed', errMsg(err, 'Server error. Please try again.'));
      // Send the user back to the step that needs fixing
      if (d.phoneVerified === false) { setO({ token: null, verifiedPhone: null, sent: false }); setStep(1); }
      else if (d.cnicVerified === false) setStep(2);
    }
    setLoading(false);
  };

  // ── Step 5: Driver details (needed for admin approval) ────────────────────
  const submitDriver = () => {
    if (!form.licenseNumber.trim() || !form.licensePlate.trim() || !form.vehicleMake.trim() || !form.vehicleModel.trim()) {
      Alert.alert('Driver Details Required', 'Please enter your license number, vehicle make, model and license plate.'); return;
    }
    handleSignup();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* ── Camera Modal for Selfie ────────────────────────────────────────── */}
      <Modal visible={showCamera} animationType="slide" onRequestClose={() => setShowCamera(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front">
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
          <Text style={styles.bannerTitle}>Join محفوظ رائیڈ 🌸</Text>
          <Text style={styles.bannerSub}>Step {step} of {totalSteps}</Text>
          <View style={styles.progressRow}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <View key={i} style={[styles.progressBar, i < step ? styles.progressActive : styles.progressInactive]} />
            ))}
          </View>
        </LinearGradient>

        <View style={styles.body}>

          {/* ════════════════════════════════════════════════════════════════
              STEP 1 — Account + Phone OTP
          ════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <>
              <Text style={styles.stepHeading}>👤 Create Your Account</Text>

              <Input label="Full Name" icon="👤" placeholder="Ayesha Khan"
                value={form.name} onChangeText={v => update('name', v)} />
              <View style={styles.gap} />
              <Input label="Email Address" icon="📧" placeholder="ayesha@example.com"
                value={form.email} onChangeText={v => update('email', v)}
                keyboardType="email-address" autoCapitalize="none" />
              <View style={styles.gap} />

              {/* Phone + OTP */}
              <Text style={styles.inputLabel}>📱 Mobile Number</Text>
              <View style={styles.rowInput}>
                <Input placeholder="03001234567" value={form.phone}
                  onChangeText={onPhoneChange}
                  keyboardType="phone-pad" maxLength={16} containerStyle={{ flex: 1 }} />
                <TouchableOpacity onPress={sendPhoneOTP} disabled={otp.sending || phoneVerified || otp.resendIn > 0}
                  style={[styles.sideBtn, phoneVerified && { backgroundColor: '#27AE60' }, (otp.resendIn > 0 && !phoneVerified) && { opacity: 0.6 }]}>
                  {otp.sending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.sideBtnText}>
                        {phoneVerified ? '✅ Verified' : otp.resendIn > 0 ? `Resend ${otp.resendIn}s` : otp.sent ? 'Resend' : 'Send OTP'}
                      </Text>}
                </TouchableOpacity>
              </View>

              {otp.sent && !phoneVerified && (
                <>
                  {!!otp.demoOtp && (
                    <View style={styles.demoBanner}>
                      <Text style={styles.demoTitle}>DEMO MODE — no SMS was sent</Text>
                      <Text style={styles.demoText}>Use demo code <Text style={{ fontWeight: '900', letterSpacing: 2 }}>{otp.demoOtp}</Text></Text>
                    </View>
                  )}
                  {!otp.demoOtp && !!otp.info && <Text style={styles.infoText}>{otp.info}</Text>}
                  <View style={styles.otpRow}>
                    <Input placeholder="6-digit code" value={otp.code}
                      onChangeText={v => setO({ code: v.replace(/\D/g, '').slice(0, 6), error: '' })}
                      keyboardType="number-pad" maxLength={6} containerStyle={{ flex: 1 }} />
                    <TouchableOpacity onPress={verifyPhoneOTP} disabled={otp.verifying}
                      style={[styles.sideBtn, { backgroundColor: C.plum }]}>
                      {otp.verifying ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sideBtnText}>Verify</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
              {!!otp.error && (
                <View style={styles.failBanner}><Text style={styles.failText}>❌ {otp.error}</Text></View>
              )}
              {phoneVerified && (
                <View style={styles.successBanner}>
                  <Text style={styles.successText}>✅ Mobile number verified ({otp.verifiedPhone})</Text>
                </View>
              )}

              <View style={{ height: 18 }} />
              <PrimaryBtn title="Continue →" onPress={nextStep1} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 2 — CNIC number + photos
          ════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <>
              <Text style={styles.stepHeading}>🪪 CNIC Verification</Text>
              <Text style={styles.stepDesc}>Enter your 13-digit CNIC. Dashes are added automatically.</Text>

              <Input label="CNIC Number" icon="🪪" placeholder="35202-1234567-2" value={form.cnic}
                onChangeText={onCnicChange} keyboardType="number-pad" maxLength={15} />

              {!cnicLocal.complete && !!cnicLocal.message && <Text style={styles.hintText}>{cnicLocal.message}</Text>}
              {cnicLocal.complete && (!cnicLocal.valid || !cnicLocal.eligible) && (
                <View style={styles.failBanner}><Text style={styles.failText}>❌ {cnicLocal.message}</Text></View>
              )}
              {cnicLocal.eligible && cnicServer.state === 'checking' && (
                <View style={styles.checkingRow}><ActivityIndicator color={C.rose} size="small" /><Text style={styles.hintText}>  Checking CNIC…</Text></View>
              )}
              {cnicLocal.eligible && cnicServer.state === 'ok' && (
                <View style={styles.successBanner}><Text style={styles.successText}>✅ {cnicServer.message}</Text></View>
              )}
              {cnicLocal.eligible && cnicServer.state === 'fail' && (
                <View style={styles.failBanner}><Text style={styles.failText}>❌ {cnicServer.message}</Text></View>
              )}

              <View style={[styles.genderBox, { marginTop: 14, marginBottom: 16 }]}>
                <Text style={styles.genderLabel}>PLATFORM POLICY</Text>
                <Text style={styles.genderNote}>
                  🛡️ Mehfooz Ride is a <Text style={{ fontWeight: '800', color: C.rose }}>women-only</Text> platform. Eligibility is checked from your CNIC (last digit even). Your CNIC photos are stored privately and only reviewed for verification.
                </Text>
              </View>

              <CnicImagePicker label="CNIC Front" image={cnicImages.front}
                onChange={img => setCnicImages(p => ({ ...p, front: img }))} />
              <CnicImagePicker label="CNIC Back" image={cnicImages.back}
                onChange={img => setCnicImages(p => ({ ...p, back: img }))} />

              <View style={{ height: 6 }} />
              <PrimaryBtn title="Continue →" onPress={nextStep2} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 3 — Selfie
          ════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <>
              <Text style={styles.stepHeading}>📸 Selfie</Text>
              <Text style={styles.stepDesc}>
                Take a live selfie with your front camera. It is kept for identity review.
              </Text>

              <View style={styles.howCard}>
                <Text style={styles.howTitle}>About this step</Text>
                {[
                  { ico: '📸', text: 'Take a live selfie using your front camera' },
                  { ico: '👩‍💼', text: 'Our team can compare it with your CNIC photo during review' },
                ].map((item, i) => (
                  <View key={i} style={styles.howRow}>
                    <Text style={{ fontSize: 20 }}>{item.ico}</Text>
                    <Text style={styles.howText}>{item.text}</Text>
                  </View>
                ))}
                <Text style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
                  ℹ️ Demo: automatic face matching (e.g. AWS Rekognition) is not connected in this version.
                </Text>
              </View>

              {selfieUri ? (
                <View style={styles.selfiePreviewBox}>
                  <Image source={{ uri: selfieUri }} style={styles.selfieImage} />
                  <View style={styles.selfieSuccess}>
                    <Text style={{ color: '#27AE60', fontWeight: '700', fontSize: 13 }}>✅ Selfie Captured</Text>
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

              <View style={styles.tipBox}>
                <Text style={styles.tipTitle}>📋 Tips for a good selfie</Text>
                {[
                  '✓ Good lighting — face a window or light source',
                  '✓ Remove glasses, mask or face cover',
                  '✓ Look directly at the camera',
                ].map((t, i) => (
                  <Text key={i} style={styles.tipItem}>{t}</Text>
                ))}
              </View>

              <View style={{ height: 18 }} />
              <PrimaryBtn title={selfieUri ? 'Continue →' : 'Take Selfie to Continue'} onPress={nextStep3} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 4 — Password + Role
          ════════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <>
              <Text style={styles.stepHeading}>🔒 Set Password & Role</Text>

              <Input label="Create Password" icon="🔒" placeholder="At least 8 characters"
                value={form.password} onChangeText={v => update('password', v)} secureTextEntry autoCapitalize="none" />
              <View style={styles.pwRules}>
                {pwRules.map(r => (
                  <Text key={r.label} style={[styles.pwRule, { color: r.ok ? '#1A7A40' : C.muted }]}>
                    {r.ok ? '✅' : '○'} {r.label}
                  </Text>
                ))}
              </View>
              <Input label="Confirm Password" icon="🔒" placeholder="Re-enter password"
                value={form.confirmPassword} onChangeText={v => update('confirmPassword', v)} secureTextEntry autoCapitalize="none" />
              {!!form.confirmPassword && form.confirmPassword !== form.password && (
                <Text style={[styles.hintText, { color: '#B03A2E' }]}>Passwords do not match</Text>
              )}
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
                title={form.role === 'driver' ? 'Next: Driver Details →' : (loading ? 'Creating Account...' : 'Create Account 🎉')}
                onPress={nextStep4} loading={loading && form.role !== 'driver'} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 5 — Driver details
          ════════════════════════════════════════════════════════════════ */}
          {step === 5 && form.role === 'driver' && (
            <>
              <Text style={styles.stepHeading}>📄 Driver Details</Text>

              <View style={styles.bgCheckCard}>
                <Text style={styles.bgCheckTitle}>🔍 Verification Process</Text>
                {[
                  '✅ Mobile number verified by OTP (Step 1)',
                  '✅ CNIC checked + photos uploaded (Step 2)',
                  '✅ Selfie captured (Step 3)',
                  '📋 Driving license number',
                  '🚗 Vehicle registration details',
                  '👩‍💼 Admin review before you can go online (24–48 hrs)',
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
                value={form.vehicleYear} onChangeText={v => update('vehicleYear', v)} keyboardType="numeric" maxLength={4} />
              <View style={styles.gap} />
              <Input label="Vehicle Color" icon="🎨" placeholder="White / Silver / Red"
                value={form.vehicleColor} onChangeText={v => update('vehicleColor', v)} />
              <View style={styles.gap} />
              <Input label="License Plate" icon="🔢" placeholder="ABC-1234"
                value={form.licensePlate} onChangeText={v => update('licensePlate', v)} autoCapitalize="characters" />

              <View style={{ height: 20 }} />
              <PrimaryBtn
                title={loading ? 'Creating Account...' : 'Submit & Create Account 🎉'}
                onPress={submitDriver} loading={loading} />
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
  // Phase 1 additions
  demoBanner:      { backgroundColor: "#FFF4D6", borderRadius: 12, padding: 10, marginTop: 10, borderWidth: 1, borderColor: "#E0A800" },
  demoTitle:       { fontSize: 11, fontWeight: "800", color: "#8A6100", letterSpacing: 0.4 },
  demoText:        { fontSize: 13, color: "#5C4300", marginTop: 3 },
  infoText:        { fontSize: 12, color: C.muted, marginTop: 8 },
  hintText:        { fontSize: 12, color: C.muted, marginTop: 6 },
  checkingRow:     { flexDirection: "row", alignItems: "center", marginTop: 6 },
  pwRules:         { marginTop: 6, marginBottom: 12, gap: 2 },
  pwRule:          { fontSize: 12 },
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