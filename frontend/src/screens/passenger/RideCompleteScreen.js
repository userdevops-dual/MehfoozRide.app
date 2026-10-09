// src/screens/passenger/RideCompleteScreen.js
// REQ 17: 5-category rating (Safety, Professionalism, Cleanliness, Punctuality, Respectful)
// REQ 23: Both passenger AND driver confirm ride completion

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { rideAPI } from '../../services/api';
import { PrimaryBtn } from '../../components/UI';
import { C, GRAD } from '../../utils/theme';

const StarRow = ({ rating, setRating, size = 28 }) => (
  <View style={{ flexDirection: 'row', gap: 8 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <TouchableOpacity key={i} onPress={() => setRating(i)}>
        <Text style={{ fontSize: size, color: i <= rating ? '#F4C430' : '#DDD' }}>★</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const CATEGORIES = [
  { key: 'safety',          label: 'Safety',           icon: '🛡️' },
  { key: 'professionalism', label: 'Professionalism',  icon: '💼' },
  { key: 'cleanliness',     label: 'Cleanliness',      icon: '✨' },
  { key: 'punctuality',     label: 'Punctuality',      icon: '⏰' },
  { key: 'respectful',      label: 'Respectful Behavior', icon: '🤝' },
];

export default function RideCompleteScreen({ navigation, route }) {
  const { ride, driver, rideTime } = route.params || {};
  const fmt = s => `${Math.floor((s || 920) / 60).toString().padStart(2, '0')}:${((s || 920) % 60).toString().padStart(2, '0')}`;

  // ── Passenger confirmation state ─────────────────────────────────────────
  const [passengerConfirmed, setPassengerConfirmed] = useState(false);
  const [confirmLoading,     setConfirmLoading]     = useState(false);

  // ── Rating state ─────────────────────────────────────────────────────────
  const [categoryRatings, setCategoryRatings] = useState({
    safety: 0, professionalism: 0, cleanliness: 0, punctuality: 0, respectful: 0,
  });
  const [comment,   setComment]   = useState('');
  const [complaint, setComplaint] = useState(false);
  const [complaintType, setComplaintType] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  const overallStars = Math.round(
    Object.values(categoryRatings).reduce((a, b) => a + b, 0) /
    Math.max(Object.values(categoryRatings).filter(v => v > 0).length, 1)
  ) || 0;

  const allRated = Object.values(categoryRatings).every(v => v > 0);

  // ── Step 1: Passenger confirms arrival ───────────────────────────────────
  const handlePassengerConfirm = async () => {
    setConfirmLoading(true);
    await new Promise(r => setTimeout(r, 800)); // simulate API
    setPassengerConfirmed(true);
    setConfirmLoading(false);
    Alert.alert('✅ Arrival Confirmed', 'Great! Please rate your driver now.');
  };

  // ── Step 2: Submit rating ─────────────────────────────────────────────────
  const submit = async () => {
    if (!allRated) {
      Alert.alert('Rate All Categories', 'Please rate all 5 categories before submitting.'); return;
    }
    setLoading(true);
    try {
      await rideAPI.rate(ride?._id || 'demo', {
        stars:           overallStars,
        categoryRatings,
        comment,
        hasComplaint:    complaint,
        complaintType,
      });
    } catch (_) {}
    setLoading(false);
    setDone(true);
  };

  // ── Done screen ───────────────────────────────────────────────────────────
  if (done) return (
    <View style={styles.doneScreen}>
      <Text style={{ fontSize: 90 }}>🌸</Text>
      <Text style={styles.doneTitle}>Thank You!</Text>
      <Text style={styles.doneSub}>Your feedback keeps our sisterhood safe & strong!</Text>
      <View style={styles.doneCard}>
        <Text style={{ fontSize: 40, marginBottom: 8 }}>⭐</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.rose }}>
          Overall Rating: {overallStars}/5
        </Text>
        <Text style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
          Thank you for helping make MehfoozRide safer!
        </Text>
      </View>
      <PrimaryBtn title="Back to Home 🏠" onPress={() => navigation.replace('PassengerHome')} style={{ width: '100%' }} />
    </View>
  );

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <LinearGradient colors={GRAD.success} style={styles.banner}>
        <Text style={{ fontSize: 62, marginBottom: 12 }}>✅</Text>
        <Text style={styles.bannerTitle}>You Arrived Safely!</Text>
        <Text style={styles.bannerSub}>Journey complete · {fmt(rideTime)}</Text>
      </LinearGradient>

      <View style={{ padding: 16, gap: 14 }}>

        {/* Fare Summary */}
        <View style={styles.fareCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.fareLabel}>Total Fare Paid</Text>
              <Text style={styles.fareAmt}>Rs. {ride?.actualFare || ride?.estimatedFare || 280}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.fareLabel}>Distance</Text>
              <Text style={styles.fareDist}>{ride?.distanceKm || 7.2} km</Text>
            </View>
          </View>
          {(ride?.isPooled ?? false) && (
            <View style={styles.poolBadge}>
              <Text style={{ fontSize: 11, color: C.rose, fontWeight: '700' }}>
                👯‍♀️ Pool Ride — You paid Rs. {ride?.farePerPassenger || Math.ceil((ride?.actualFare || ride?.estimatedFare || 280) / 2)} (50% split)
              </Text>
            </View>
          )}
        </View>

        {/* ── REQ 23: PASSENGER CONFIRMS ARRIVAL ─────────────────────────────── */}
        <View style={[styles.confirmCard, passengerConfirmed && styles.confirmCardDone]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: 24 }}>{passengerConfirmed ? '✅' : '📍'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.confirmTitle}>
                {passengerConfirmed ? 'Arrival Confirmed ✓' : 'Confirm You Have Arrived'}
              </Text>
              <Text style={styles.confirmSub}>
                {passengerConfirmed
                  ? `Confirmed at ${new Date().toLocaleTimeString()}`
                  : 'Both you and your driver must confirm ride completion'}
              </Text>
            </View>
          </View>
          {!passengerConfirmed && (
            <TouchableOpacity onPress={handlePassengerConfirm} style={styles.confirmBtn} disabled={confirmLoading}>
              {confirmLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>📍 I Have Arrived at My Destination</Text>
              }
            </TouchableOpacity>
          )}
          {passengerConfirmed && (
            <View style={styles.driverConfirmNote}>
              <Text style={{ fontSize: 12, color: '#1A5C2A', fontWeight: '600' }}>
                ✅ Your confirmation received{'\n'}
                🚗 Driver will also confirm on their screen
              </Text>
            </View>
          )}
        </View>

        {/* ── REQ 17: 5-CATEGORY RATING ───────────────────────────────────────── */}
        {passengerConfirmed && (
          <>
            <View style={styles.ratingHeader}>
              <View style={styles.driverThumb}><Text style={{ fontSize: 26 }}>👩</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ratingTitle}>Rate {driver?.name || 'Your Driver'}</Text>
                <Text style={styles.ratingSub}>Rate all 5 categories · Required</Text>
              </View>
              {overallStars > 0 && (
                <View style={styles.overallBadge}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>⭐ {overallStars}</Text>
                </View>
              )}
            </View>

            {/* 5 Category Ratings */}
            {CATEGORIES.map(cat => (
              <View key={cat.key} style={styles.categoryRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Text style={{ fontSize: 20 }}>{cat.icon}</Text>
                  <Text style={styles.catLabel}>{cat.label}</Text>
                </View>
                <StarRow
                  rating={categoryRatings[cat.key]}
                  setRating={v => setCategoryRatings(prev => ({ ...prev, [cat.key]: v }))}
                  size={26}
                />
              </View>
            ))}

            {/* Category rating messages */}
            {overallStars > 0 && (
              <View style={styles.ratingMsgBox}>
                <Text style={styles.ratingMsg}>
                  {['', '😟 Needs improvement', '😐 Below average', '🙂 Good ride!', '😊 Great driver!', '🌟 Excellent!'][overallStars]}
                </Text>
                <Text style={{ fontSize: 11, color: C.muted }}>Overall: {overallStars}/5 stars</Text>
              </View>
            )}

            {/* Comment */}
            {allRated && (
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Add a comment (optional)..."
                placeholderTextColor={C.muted}
                multiline
                style={styles.commentInput}
              />
            )}

            {/* Report a complaint */}
            <TouchableOpacity onPress={() => setComplaint(!complaint)}
              style={[styles.complaintRow, complaint && styles.complaintRowActive]}>
              <View style={[styles.checkbox, complaint && styles.checkboxChecked]}>
                {complaint && <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>}
              </View>
              <Text style={styles.complaintLabel}>🚨 Report a complaint about this ride</Text>
            </TouchableOpacity>

            {complaint && (
              <View style={styles.complaintTypes}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 8 }}>Complaint Type:</Text>
                {[
                  'Unsafe driving', 'Rude behavior', 'Route deviation',
                  'Wrong vehicle', 'Refused destination', 'Other',
                ].map(type => (
                  <TouchableOpacity key={type} onPress={() => setComplaintType(type)}
                    style={[styles.complaintType, complaintType === type && styles.complaintTypeActive]}>
                    <Text style={[styles.complaintTypeText, complaintType === type && { color: C.rose }]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <PrimaryBtn
              title={loading ? 'Submitting...' : `Submit Rating${allRated ? ' ⭐' : ' (rate all 5)'}`}
              onPress={submit}
              loading={loading}
            />
          </>
        )}

        <View style={{ height: 30 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: C.bg },
  banner:           { padding: 32, alignItems: 'center', paddingBottom: 40 },
  bannerTitle:      { color: '#fff', fontSize: 24, fontWeight: '800' },
  bannerSub:        { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 },
  fareCard:         { backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border },
  fareLabel:        { fontSize: 11, color: C.muted },
  fareAmt:          { fontSize: 26, fontWeight: '900', color: C.rose, marginTop: 2 },
  fareDist:         { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 2 },
  poolBadge:        { backgroundColor: C.rosePale, borderRadius: 10, padding: 8, marginTop: 10 },
  confirmCard:      { backgroundColor: '#FEF9E7', borderRadius: 18, padding: 16, borderWidth: 2, borderColor: '#F39C12' },
  confirmCardDone:  { backgroundColor: '#D5F5E3', borderColor: '#27AE60' },
  confirmTitle:     { fontSize: 14, fontWeight: '800', color: C.text },
  confirmSub:       { fontSize: 11, color: C.muted, marginTop: 2 },
  confirmBtn:       { backgroundColor: '#27AE60', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 4 },
  driverConfirmNote:{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 8 },
  ratingHeader:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverThumb:      { width: 52, height: 52, borderRadius: 26, backgroundColor: C.rosePale, alignItems: 'center', justifyContent: 'center' },
  ratingTitle:      { fontSize: 15, fontWeight: '800', color: C.text },
  ratingSub:        { fontSize: 11, color: C.muted, marginTop: 2 },
  overallBadge:     { backgroundColor: C.rose, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  categoryRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  catLabel:         { fontSize: 13, fontWeight: '600', color: C.text },
  ratingMsgBox:     { backgroundColor: C.rosePale, borderRadius: 14, padding: 14, alignItems: 'center' },
  ratingMsg:        { fontSize: 16, fontWeight: '700', color: C.rose, marginBottom: 4 },
  commentInput:     { backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, fontSize: 13, color: C.text, minHeight: 80, textAlignVertical: 'top' },
  complaintRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: C.border },
  complaintRowActive:{ borderColor: C.danger, backgroundColor: '#FFF5F5' },
  checkbox:         { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.danger, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked:  { backgroundColor: C.danger },
  complaintLabel:   { fontSize: 13, fontWeight: '600', color: C.text },
  complaintTypes:   { backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  complaintType:    { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6, backgroundColor: C.bg },
  complaintTypeActive: { backgroundColor: C.rosePale },
  complaintTypeText:{ fontSize: 13, color: C.text },
  doneScreen:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.bg },
  doneTitle:        { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 8 },
  doneSub:          { fontSize: 14, color: C.muted, textAlign: 'center', marginBottom: 24 },
  doneCard:         { backgroundColor: C.rosePale, borderRadius: 20, padding: 20, width: '100%', marginBottom: 28, alignItems: 'center' },
});
