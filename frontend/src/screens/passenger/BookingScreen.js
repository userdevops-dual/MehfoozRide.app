// src/screens/passenger/BookingScreen.js
// REQ 5: Booking with pickup, destination, fare, ride type
// REQ 8: Ride pooling + fare split
// REQ 10: Fare formula
// REQ 14: Route shown before ride (map + distance + time estimate)
// REQ 16: Mood preference

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import LinearGradient from 'react-native-linear-gradient';
import { rideAPI } from '../../services/api';
import { emitNewRideRequest } from '../../services/socket';
import { Input, PrimaryBtn } from '../../components/UI';
import { C, GRAD } from '../../utils/theme';

const BASE_FARE   = 80;
const RATE_PER_KM = 25;
const RATE_PER_MIN= 5;
const POOL_DISC   = 100;

// Demo route coordinates (Lahore: DHA → Gulberg)
const PICKUP_COORD  = { latitude: 31.4804, longitude: 74.3436 };
const DROPOFF_COORD = { latitude: 31.5204, longitude: 74.3587 };
const ROUTE_POINTS  = [
  { latitude: 31.4804, longitude: 74.3436 },
  { latitude: 31.4900, longitude: 74.3480 },
  { latitude: 31.5000, longitude: 74.3520 },
  { latitude: 31.5100, longitude: 74.3550 },
  { latitude: 31.5204, longitude: 74.3587 },
];

const RIDE_TYPES = [
  { id: 'economy', icon: '🚗', label: 'Economy Car', desc: 'Suzuki / Mehran / Alto', baseAdd: 0,   eta: '3 min', seats: '4 seats' },
  { id: 'ac',      icon: '❄️', label: 'AC Sedan',    desc: 'Toyota / Honda City',   baseAdd: 50,  eta: '5 min', seats: '4 seats' },
  { id: 'bike',    icon: '🛵', label: 'Bike',         desc: 'Verified female rider', baseAdd: -50, eta: '2 min', seats: '1 seat'  },
];

export default function BookingScreen({ navigation }) {
  const [pickup,   setPickup]   = useState('DHA Phase 5, Lahore');
  const [dropoff,  setDropoff]  = useState('');
  const [mood,     setMood]     = useState('quiet');
  const [pooling,  setPooling]  = useState(false);
  const [rideType, setRideType] = useState('economy');
  const [loading,  setLoading]  = useState(false);
  const [showMap,  setShowMap]  = useState(false);

  const dist         = 7.2;
  const estMins      = Math.round(dist * 3.5);
  const distFare     = dist * RATE_PER_KM;
  const timeFare     = estMins * RATE_PER_MIN;
  const rideAdd      = RIDE_TYPES.find(r => r.id === rideType)?.baseAdd || 0;
  const totalBefore  = BASE_FARE + distFare + timeFare + rideAdd;
  const discount     = pooling ? POOL_DISC : 0;
  const totalFare    = Math.max(totalBefore - discount, 50);
  const farePerPax   = pooling ? Math.ceil(totalFare / 2) : totalFare;

  // Show route map when dropoff entered
  useEffect(() => {
    if (dropoff.trim().length > 3) setShowMap(true);
    else setShowMap(false);
  }, [dropoff]);

  const handleBook = async () => {
    if (!dropoff.trim()) {
      Alert.alert('Missing Destination', 'Please enter where you want to go.'); return;
    }
    setLoading(true);
    try {
      const res = await rideAPI.book({
        pickupAddress:      pickup,
        pickupCoordinates:  [74.3436, 31.4804],
        dropoffAddress:     dropoff,
        dropoffCoordinates: [74.3587, 31.5204],
        distanceKm:         dist,
        moodPreference:     mood,
        isPooled:           pooling,
        rideType,
      });
      if (res.success) {
        emitNewRideRequest(res.ride._id, [74.3436, 31.4804]);
        navigation.navigate('FindingDriver', { ride: res.ride });
      } else {
        Alert.alert('Booking Failed', res.message);
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Server error. Check your backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: C.rose, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Your Safe Ride 🛡️</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Location Inputs */}
        <View style={styles.locationCard}>
          <View style={styles.locationRow}>
            <View style={[styles.dot, { backgroundColor: C.success }]} />
            <Input placeholder="Pickup location" value={pickup}
              onChangeText={setPickup} style={styles.locationInput} />
          </View>
          <View style={[styles.locationRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
            <View style={[styles.dot, { backgroundColor: C.rose }]} />
            <Input placeholder="Where to? e.g. Gulberg III" value={dropoff}
              onChangeText={setDropoff} style={styles.locationInput} />
          </View>
        </View>

        {/* REQ 14: Live Route Map — shows when dropoff entered */}
        {showMap ? (
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude:      31.5004,
                longitude:     74.3510,
                latitudeDelta:  0.08,
                longitudeDelta: 0.06,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Marker coordinate={PICKUP_COORD}  title="Pickup"      pinColor={C.success} />
              <Marker coordinate={DROPOFF_COORD} title="Destination" pinColor={C.rose}    />
              <Polyline
                coordinates={ROUTE_POINTS}
                strokeColor={C.rose}
                strokeWidth={4}
                lineDashPattern={[0]}
              />
            </MapView>
            {/* Route info overlay */}
            <View style={styles.routeOverlay}>
              <View style={styles.routeStat}>
                <Text style={styles.routeStatVal}>{dist} km</Text>
                <Text style={styles.routeStatLbl}>Distance</Text>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routeStat}>
                <Text style={styles.routeStatVal}>{estMins} min</Text>
                <Text style={styles.routeStatLbl}>Est. Time</Text>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routeStat}>
                <Text style={[styles.routeStatVal, { color: C.rose }]}>Rs. {farePerPax}</Text>
                <Text style={styles.routeStatLbl}>Est. Fare</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={{ fontSize: 32 }}>🗺️</Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
              Enter destination to see route
            </Text>
          </View>
        )}

        <View style={{ padding: 14, gap: 14 }}>

          {/* REQ 5: Ride Type */}
          <View>
            <Text style={styles.sectionTitle}>🚗 Select Ride Type</Text>
            <View style={{ gap: 10 }}>
              {RIDE_TYPES.map(rt => (
                <TouchableOpacity key={rt.id} onPress={() => setRideType(rt.id)}
                  style={[styles.rideTypeCard, rideType === rt.id && styles.rideTypeActive]}>
                  <Text style={{ fontSize: 26 }}>{rt.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rideTypeLabel, rideType === rt.id && { color: C.rose }]}>{rt.label}</Text>
                    <Text style={styles.rideTypeDesc}>{rt.desc} · {rt.seats}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.rideTypePrice, rideType === rt.id && { color: C.rose }]}>
                      Rs. {Math.max(farePerPax + rt.baseAdd - (RIDE_TYPES.find(r => r.id === rideType)?.baseAdd || 0), 50)}
                    </Text>
                    <Text style={{ fontSize: 10, color: C.muted }}>ETA {rt.eta}</Text>
                  </View>
                  {rideType === rt.id && (
                    <View style={styles.rideTypeCheck}><Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text></View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* REQ 16: Mood */}
          <View>
            <Text style={styles.sectionTitle}>🎭 Ride Mood Preference</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { id: 'quiet',     icon: '🤫', label: 'Quiet',    desc: 'No chat' },
                { id: 'friendly',  icon: '😊', label: 'Friendly', desc: 'Light chat' },
                { id: 'talkative', icon: '💬', label: 'Talkative',desc: 'Very social' },
              ].map(m => (
                <TouchableOpacity key={m.id} onPress={() => setMood(m.id)}
                  style={[styles.moodCard, mood === m.id && styles.moodCardActive]}>
                  <Text style={{ fontSize: 22 }}>{m.icon}</Text>
                  <Text style={[styles.moodLabel, mood === m.id && { color: C.rose }]}>{m.label}</Text>
                  <Text style={styles.moodDesc}>{m.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* REQ 8: Pooling */}
          <View style={[styles.poolCard, pooling && styles.poolCardActive]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.poolTitle}>👯‍♀️ Ride Pooling</Text>
              <Text style={styles.poolDesc}>Share with verified women • Save Rs.{POOL_DISC}</Text>
              {pooling && (
                <Text style={{ fontSize: 11, color: C.success, marginTop: 4, fontWeight: '600' }}>
                  💰 You pay Rs.{farePerPax} instead of Rs.{Math.round(totalBefore)}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setPooling(!pooling)}
              style={[styles.poolToggle, pooling && styles.poolToggleActive]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                {pooling ? 'ON ✓' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* REQ 10: Fare Breakdown */}
          <View style={styles.fareCard}>
            <Text style={styles.sectionTitle}>💰 Fare Breakdown</Text>
            {[
              { lbl: 'Base Fare',                                       val: `Rs. ${BASE_FARE}`                   },
              { lbl: `Distance (${dist}km × Rs.${RATE_PER_KM}/km)`,    val: `Rs. ${Math.round(distFare)}`        },
              { lbl: `Time (~${estMins}min × Rs.${RATE_PER_MIN}/min)`,  val: `Rs. ${Math.round(timeFare)}`        },
              { lbl: `${RIDE_TYPES.find(r=>r.id===rideType)?.label} surcharge`, val: rideAdd >= 0 ? `Rs. ${rideAdd}` : `−Rs. ${Math.abs(rideAdd)}` },
            ].map((row, i) => (
              <View key={i} style={styles.fareRow}>
                <Text style={styles.fareLabel}>{row.lbl}</Text>
                <Text style={styles.fareValue}>{row.val}</Text>
              </View>
            ))}
            {pooling && (
              <View style={[styles.fareRow, { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, marginTop: 4 }]}>
                <Text style={[styles.fareLabel, { color: C.success }]}>Pool Discount</Text>
                <Text style={[styles.fareValue, { color: C.success }]}>− Rs. {POOL_DISC}</Text>
              </View>
            )}
            <View style={[styles.fareRow, { borderTopWidth: 2, borderTopColor: C.rose, marginTop: 6, paddingTop: 10 }]}>
              <Text style={[styles.fareLabel, { fontWeight: '800', color: C.text, fontSize: 14 }]}>
                {pooling ? 'Your Share (50%)' : 'Total Fare'}
              </Text>
              <Text style={[styles.fareValue, { color: C.rose, fontWeight: '900', fontSize: 20 }]}>
                Rs. {farePerPax}
              </Text>
            </View>
            <Text style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
              ⏱️ Final fare = Base + Actual Distance + Actual Time. Above is estimate.
            </Text>
          </View>

          {/* Safety reminder */}
          <View style={styles.safetyCard}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A5C2A', marginBottom: 8 }}>🛡️ Safety Active</Text>
            {['🔐 OTP verification before ride starts', '👁️ Guardian contacts auto-notified', '📍 Route deviation monitoring ON', '🆘 One-tap SOS during ride'].map((s, i) => (
              <Text key={i} style={{ fontSize: 11, color: '#2E7D32', marginBottom: 3 }}>{s}</Text>
            ))}
          </View>

          <PrimaryBtn
            title={loading ? 'Booking...' : `Book Ride — Rs. ${farePerPax} 🌸`}
            onPress={handleBook}
            loading={loading}
          />
          <View style={{ height: 30 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: C.bg },
  header:           { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingTop: 50, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:          { padding: 4 },
  headerTitle:      { fontSize: 16, fontWeight: '800', color: C.text },
  locationCard:     { backgroundColor: C.white, margin: 14, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  locationRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  dot:              { width: 12, height: 12, borderRadius: 6 },
  locationInput:    { flex: 1, fontSize: 13, color: C.text, paddingVertical: 8 },
  mapContainer:     { margin: 14, marginTop: 0, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  map:              { height: 180 },
  routeOverlay:     { flexDirection: 'row', backgroundColor: C.white, padding: 12, justifyContent: 'space-around', alignItems: 'center' },
  routeStat:        { alignItems: 'center' },
  routeStatVal:     { fontSize: 15, fontWeight: '800', color: C.text },
  routeStatLbl:     { fontSize: 10, color: C.muted, marginTop: 2 },
  routeDivider:     { width: 1, height: 28, backgroundColor: C.border },
  mapPlaceholder:   { height: 120, margin: 14, marginTop: 0, backgroundColor: '#FBF0F7', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:     { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },
  rideTypeCard:     { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 18, borderWidth: 2, borderColor: C.border, backgroundColor: C.white },
  rideTypeActive:   { borderColor: C.rose, backgroundColor: C.rosePale },
  rideTypeLabel:    { fontWeight: '700', fontSize: 14, color: C.text },
  rideTypeDesc:     { fontSize: 11, color: C.muted, marginTop: 2 },
  rideTypePrice:    { fontSize: 14, fontWeight: '800', color: C.text },
  rideTypeCheck:    { width: 22, height: 22, borderRadius: 11, backgroundColor: C.rose, alignItems: 'center', justifyContent: 'center' },
  moodCard:         { flex: 1, borderRadius: 14, borderWidth: 2, borderColor: C.border, backgroundColor: C.white, padding: 10, alignItems: 'center', gap: 4 },
  moodCardActive:   { borderColor: C.rose, backgroundColor: C.rosePale },
  moodLabel:        { fontSize: 11, fontWeight: '700', color: C.text, textAlign: 'center' },
  moodDesc:         { fontSize: 9, color: C.muted, textAlign: 'center' },
  poolCard:         { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: C.border },
  poolCardActive:   { borderColor: C.rose, backgroundColor: C.rosePale },
  poolTitle:        { fontSize: 14, fontWeight: '700', color: C.text },
  poolDesc:         { fontSize: 11, color: C.muted, marginTop: 2 },
  poolToggle:       { backgroundColor: C.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  poolToggleActive: { backgroundColor: C.rose },
  fareCard:         { backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border },
  fareRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  fareLabel:        { fontSize: 12, color: C.muted },
  fareValue:        { fontSize: 12, fontWeight: '700', color: C.text },
  safetyCard:       { backgroundColor: '#F0F9F0', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#27AE60' },
});
