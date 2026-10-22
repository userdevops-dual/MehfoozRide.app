// src/screens/passenger/BookingScreen.js
// Book a ride:
//   1. GPS → current location becomes the pickup (or search / tap the map)
//   2. Destination by search or by tapping the map
//   3. Real road routes from the server (OSRM) with alternatives — passenger picks one
//   4. Distance, time and fare for the chosen route, all calculated by the server
//   5. Ride type, mood, pooling → Book
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, TextInput, Keyboard,
} from 'react-native';
import { rideAPI, geoAPI } from '../../services/api';
import { getCurrentLocation, openLocationSettings, LocationError, LOW_ACCURACY_METERS } from '../../services/location';
import OSMMap from '../../components/OSMMap';
import { PrimaryBtn } from '../../components/UI';
import { C } from '../../utils/theme';

const RIDE_TYPES = [
  { id: 'economy', icon: '🚗', label: 'Economy Car', desc: 'Suzuki / Mehran / Alto', note: 'Standard fare', seats: '4 seats' },
  { id: 'ac',      icon: '❄️', label: 'AC Sedan',    desc: 'Toyota / Honda City',   note: '+Rs 50',        seats: '4 seats' },
  { id: 'bike',    icon: '🛵', label: 'Bike',         desc: 'Verified female rider', note: '−Rs 50',        seats: '1 seat'  },
];

const MOODS = [
  // Stored with the ride and shown to the driver with the request
  { id: 'talkative', icon: '💬', label: 'Talkative', desc: 'Happy to chat' },
  { id: 'quiet',     icon: '🤫', label: 'Quiet',     desc: 'Little talk' },
  { id: 'introvert', icon: '🎧', label: 'Introvert', desc: 'Minimal conversation' },
];

const ROUTE_COLORS = { selected: '#C84B7A', other: '#9AA0A6' };

const errMsg = (err, fallback) =>
  err?.response?.data?.message || (err?.request && !err?.response ? 'Cannot reach the server. Check your internet connection.' : fallback);

const toLngLat = (p) => [p.longitude, p.latitude];

export default function BookingScreen({ navigation }) {
  // Location
  const [myLoc,    setMyLoc]    = useState(null);
  const [locState, setLocState] = useState({ loading: true, error: null });

  // Trip points: { name, address, latitude, longitude }
  const [pickup,  setPickup]  = useState(null);
  const [dropoff, setDropoff] = useState(null);

  // Search panel / map picking
  const [editing,     setEditing]     = useState(null);   // 'pickup' | 'dropoff' | null
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [searchError, setSearchError] = useState('');
  const [pickOnMap,   setPickOnMap]   = useState(null);   // 'pickup' | 'dropoff' | null
  const [resolving,   setResolving]   = useState(false);

  // Routes + fare (from the server)
  const [estimate,      setEstimate]      = useState({ loading: false, error: '', routes: [], source: null, warning: null });
  const [selectedRoute, setSelectedRoute] = useState(0);

  // Options
  const [mood,     setMood]     = useState('quiet');
  const [pooling,  setPooling]  = useState(false);
  const [rideType, setRideType] = useState('economy');
  const [booking,  setBooking]  = useState(false);

  const estimateSeq = useRef(0);

  // ── 1. Current location → pickup ──────────────────────────────────────────
  const locate = useCallback(async () => {
    setLocState({ loading: true, error: null });
    const res = await getCurrentLocation();
    if (res.error) { setLocState({ loading: false, error: res.error }); return; }
    setMyLoc(res.coords);
    setLocState({ loading: false, error: null });
    // Only fill the pickup automatically if the passenger hasn't chosen one
    setPickup(prev => prev || { name: 'Current location', address: 'Finding address…', latitude: res.coords.latitude, longitude: res.coords.longitude, gps: true });
    try {
      const { place } = await geoAPI.reverse(res.coords);
      setPickup(prev => (prev?.gps ? { ...prev, name: place.name, address: place.address } : prev));
    } catch {
      setPickup(prev => (prev?.gps ? { ...prev, address: `${res.coords.latitude.toFixed(5)}, ${res.coords.longitude.toFixed(5)}` } : prev));
    }
  }, []);

  useEffect(() => { locate(); }, [locate]);

  const useCurrentLocationAsPickup = async () => {
    setEditing(null);
    setPickup(null);
    await locate();
  };

  // ── 2. Search (on submit — the free geocoder must not be called per keystroke) ──
  const openSearch = (field) => {
    setEditing(field); setQuery(''); setResults([]); setSearchError(''); setPickOnMap(null);
  };

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 3) { setSearchError('Type at least 3 characters.'); return; }
    Keyboard.dismiss();
    setSearching(true); setSearchError(''); setResults([]);
    try {
      const res = await geoAPI.search(q, myLoc || pickup);
      setResults(res.places || []);
      if (!res.places?.length) setSearchError('No places found. Try a different name or area (e.g. "Liberty Market Gulberg").');
    } catch (err) {
      setSearchError(errMsg(err, 'Search failed. Please try again.'));
    }
    setSearching(false);
  };

  const choosePlace = (place) => {
    const p = { name: place.name, address: place.address, latitude: place.lat, longitude: place.lng };
    editing === 'pickup' ? setPickup(p) : setDropoff(p);
    setEditing(null); setResults([]); setQuery('');
  };

  // ── 2b. Tap on the map ────────────────────────────────────────────────────
  const startPickOnMap = (field) => { setEditing(null); setPickOnMap(field); };

  const onMapPress = async ({ latitude, longitude }) => {
    if (!pickOnMap) return;
    const field = pickOnMap;
    setPickOnMap(null);
    setResolving(true);
    const point = { name: 'Pinned location', address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude };
    try {
      const { place } = await geoAPI.reverse({ latitude, longitude });
      point.name = place.name; point.address = place.address;
    } catch { /* keep coordinates as the address */ }
    field === 'pickup' ? setPickup(point) : setDropoff(point);
    setResolving(false);
  };

  // ── 3. Routes + fare from the server ──────────────────────────────────────
  useEffect(() => {
    if (!pickup || !dropoff) { setEstimate({ loading: false, error: '', routes: [], source: null, warning: null }); return; }
    const seq = ++estimateSeq.current;
    setEstimate(e => ({ ...e, loading: true, error: '' }));
    rideAPI.estimate({
      pickupCoordinates: toLngLat(pickup), dropoffCoordinates: toLngLat(dropoff),
      rideType, isPooled: pooling,
    }).then(res => {
      if (seq !== estimateSeq.current) return;          // a newer request replaced this one
      setEstimate({ loading: false, error: '', routes: res.routes || [], source: res.source, warning: res.warning || null });
      setSelectedRoute(i => (i < (res.routes || []).length ? i : 0));
    }).catch(err => {
      if (seq !== estimateSeq.current) return;
      setEstimate({ loading: false, error: errMsg(err, 'Could not calculate the route.'), routes: [], source: null, warning: null });
    });
  }, [pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, rideType, pooling]);

  // New pickup/destination → back to the first (recommended) route
  useEffect(() => { setSelectedRoute(0); }, [pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude]);

  const route = estimate.routes[selectedRoute];
  const fare  = route?.fare;

  // ── 5. Book ───────────────────────────────────────────────────────────────
  const handleBook = async () => {
    if (!pickup)  { Alert.alert('Pickup Needed', 'Choose where you want to be picked up.'); return; }
    if (!dropoff) { Alert.alert('Destination Needed', 'Choose where you want to go.'); return; }
    if (!route)   { Alert.alert('Route Not Ready', estimate.error || 'Please wait for the route to load.'); return; }
    setBooking(true);
    try {
      const res = await rideAPI.book({
        pickupAddress:      pickup.address || pickup.name,
        pickupCoordinates:  toLngLat(pickup),
        dropoffAddress:     dropoff.address || dropoff.name,
        dropoffCoordinates: toLngLat(dropoff),
        routeIndex:         route.index,
        moodPreference:     mood,
        isPooled:           pooling,
        rideType,
      });
      // The server offers the request to nearby drivers itself
      navigation.navigate('FindingDriver', { ride: res.ride, pool: res.pool, driversNotified: res.driversNotified });
    } catch (err) {
      const d = err?.response?.data;
      if (d?.rideId) {
        Alert.alert('Active Ride', 'You already have an active ride. Finish or cancel it before booking another.');
      } else {
        Alert.alert('Booking Failed', errMsg(err, 'Server error. Please try again.'));
      }
    }
    setBooking(false);
  };

  // ── Map content ───────────────────────────────────────────────────────────
  const markers = [
    ...(myLoc ? [{ id: 'me', latitude: myLoc.latitude, longitude: myLoc.longitude, color: '#2D7FF9', accuracy: myLoc.accuracy, label: 'You are here' }] : []),
    ...(pickup  ? [{ id: 'pickup',  latitude: pickup.latitude,  longitude: pickup.longitude,  color: C.success, label: `Pickup: ${pickup.name}` }] : []),
    ...(dropoff ? [{ id: 'dropoff', latitude: dropoff.latitude, longitude: dropoff.longitude, color: C.rose,    label: `Destination: ${dropoff.name}` }] : []),
  ];
  const mapRoutes = [
    ...estimate.routes.filter(r => r.index !== route?.index)
      .map(r => ({ id: r.index, coordinates: r.coordinates, color: ROUTE_COLORS.other, weight: 5, opacity: 0.7 })),
    ...(route ? [{ id: route.index, coordinates: route.coordinates, color: ROUTE_COLORS.selected, weight: 6, dashed: estimate.source === 'straight_line' }] : []),
  ];
  const fitKey = `${pickup?.latitude},${pickup?.longitude}|${dropoff?.latitude},${dropoff?.longitude}|${estimate.routes.length}`;

  // ── Render ────────────────────────────────────────────────────────────────
  const PointRow = ({ field, point, dot, placeholder }) => (
    <TouchableOpacity onPress={() => openSearch(field)} style={styles.pointRow} accessibilityRole="button">
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.pointLabel}>{field === 'pickup' ? 'PICKUP' : 'DESTINATION'}</Text>
        {point
          ? <>
              <Text style={styles.pointName} numberOfLines={1}>{point.name}</Text>
              <Text style={styles.pointAddr} numberOfLines={1}>{point.address}</Text>
            </>
          : <Text style={styles.pointPlaceholder}>{placeholder}</Text>}
      </View>
      <Text style={styles.editText}>{point ? 'Change' : 'Set'}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: C.rose, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Your Safe Ride 🛡️</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Location problems */}
        {locState.loading && !myLoc && (
          <View style={styles.infoBanner}><ActivityIndicator size="small" color={C.rose} /><Text style={styles.infoText}>  Finding your location…</Text></View>
        )}
        {locState.error && (
          <View style={styles.warnBanner}>
            <Text style={styles.warnText}>📍 {locState.error.message}</Text>
            <Text style={styles.warnSub}>You can still search for your pickup or tap it on the map.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity onPress={locate} style={styles.smallBtn}><Text style={styles.smallBtnText}>Try again</Text></TouchableOpacity>
              {locState.error.code === LocationError.PERMISSION_BLOCKED && (
                <TouchableOpacity onPress={openLocationSettings} style={styles.smallBtn}><Text style={styles.smallBtnText}>Open Settings</Text></TouchableOpacity>
              )}
            </View>
          </View>
        )}
        {myLoc && myLoc.accuracy > LOW_ACCURACY_METERS && (
          <View style={styles.infoBanner}><Text style={styles.infoText}>⚠️ Your location is approximate (±{myLoc.accuracy} m). Check the pickup pin.</Text></View>
        )}

        {/* Pickup + destination */}
        <View style={styles.locationCard}>
          <PointRow field="pickup"  point={pickup}  dot={C.success} placeholder="Where should we pick you up?" />
          <View style={styles.divider} />
          <PointRow field="dropoff" point={dropoff} dot={C.rose}    placeholder="Where to? e.g. Liberty Market" />
        </View>

        {/* Search panel */}
        {editing && (
          <View style={styles.searchPanel}>
            <Text style={styles.sectionTitle}>{editing === 'pickup' ? '📍 Choose pickup' : '🏁 Choose destination'}</Text>
            <View style={styles.searchRow}>
              <TextInput
                value={query} onChangeText={setQuery} autoFocus
                placeholder="Search a place, market, area…" placeholderTextColor={C.muted}
                style={styles.searchInput} returnKeyType="search" onSubmitEditing={runSearch}
              />
              <TouchableOpacity onPress={runSearch} style={styles.searchBtn} disabled={searching}>
                {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchBtnText}>Search</Text>}
              </TouchableOpacity>
            </View>
            <View style={styles.searchActions}>
              {editing === 'pickup' && (
                <TouchableOpacity onPress={useCurrentLocationAsPickup} style={styles.chip}><Text style={styles.chipText}>📍 Use my current location</Text></TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => startPickOnMap(editing)} style={styles.chip}><Text style={styles.chipText}>🗺️ Choose on map</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(null)} style={styles.chip}><Text style={styles.chipText}>Cancel</Text></TouchableOpacity>
            </View>
            {!!searchError && <Text style={styles.errorText}>{searchError}</Text>}
            {results.map(p => (
              <TouchableOpacity key={p.id} onPress={() => choosePlace(p)} style={styles.resultRow}>
                <Text style={{ fontSize: 16 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.resultAddr} numberOfLines={2}>{p.address}</Text>
                </View>
                {p.distanceKm != null && <Text style={styles.resultDist}>{p.distanceKm} km</Text>}
              </TouchableOpacity>
            ))}
            <Text style={styles.attribution}>Search © OpenStreetMap contributors (Nominatim)</Text>
          </View>
        )}

        {/* Map */}
        <View style={styles.mapContainer}>
          <OSMMap
            style={styles.map}
            center={myLoc || pickup || { latitude: 31.5204, longitude: 74.3587 }}
            zoom={myLoc ? 15 : 12}
            markers={markers}
            routes={mapRoutes}
            fitToContent={!!(pickup && dropoff)}
            fitKey={fitKey}
            onMapPress={onMapPress}
            onRoutePress={(id) => {
              const i = estimate.routes.findIndex(r => r.index === id);
              if (i >= 0) setSelectedRoute(i);
            }}
          />
          {(pickOnMap || resolving) && (
            <View style={styles.mapBanner}>
              <Text style={styles.mapBannerText}>
                {resolving ? 'Getting address…' : `Tap the map to set your ${pickOnMap === 'pickup' ? 'pickup' : 'destination'}`}
              </Text>
              {pickOnMap && <TouchableOpacity onPress={() => setPickOnMap(null)}><Text style={styles.mapBannerCancel}>Cancel</Text></TouchableOpacity>}
            </View>
          )}
        </View>

        <View style={{ padding: 14, gap: 14 }}>
          {/* Routes */}
          {pickup && dropoff && (
            <View>
              <Text style={styles.sectionTitle}>🛣️ Choose your route</Text>
              {estimate.loading && <View style={styles.infoRow}><ActivityIndicator color={C.rose} /><Text style={styles.infoText}>  Calculating routes…</Text></View>}
              {!!estimate.error && (
                <View style={styles.warnBanner}>
                  <Text style={styles.warnText}>{estimate.error}</Text>
                  <TouchableOpacity onPress={() => setPickup(p => ({ ...p }))} style={[styles.smallBtn, { marginTop: 8, alignSelf: 'flex-start' }]}>
                    <Text style={styles.smallBtnText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!!estimate.warning && <Text style={styles.warnInline}>⚠️ {estimate.warning}</Text>}
              {!estimate.loading && estimate.routes.map((r, i) => (
                <TouchableOpacity key={r.index} onPress={() => setSelectedRoute(i)}
                  style={[styles.routeCard, i === selectedRoute && styles.routeCardActive]}>
                  <View style={[styles.routeSwatch, { backgroundColor: i === selectedRoute ? ROUTE_COLORS.selected : ROUTE_COLORS.other }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.routeTitle, i === selectedRoute && { color: C.rose }]}>
                      {i === 0 ? 'Recommended route' : `Alternative ${i}`}{r.summary ? ` · via ${r.summary}` : ''}
                    </Text>
                    <Text style={styles.routeSub}>{r.distanceKm} km · about {r.durationMin} min</Text>
                  </View>
                  <Text style={[styles.routeFare, i === selectedRoute && { color: C.rose }]}>Rs {r.fare.total}</Text>
                  {i === selectedRoute && <View style={styles.check}><Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text></View>}
                </TouchableOpacity>
              ))}
              {estimate.routes.length > 0 && (
                <Text style={styles.hint}>
                  Your chosen route is saved with the ride so we can alert you if the driver goes far off it.
                  {estimate.routes.length === 1 ? ' No alternative route was found for this trip.' : ''}
                </Text>
              )}
            </View>
          )}

          {/* Ride type */}
          <View>
            <Text style={styles.sectionTitle}>🚗 Ride Type</Text>
            <View style={{ gap: 10 }}>
              {RIDE_TYPES.map(rt => (
                <TouchableOpacity key={rt.id} onPress={() => setRideType(rt.id)}
                  style={[styles.rideTypeCard, rideType === rt.id && styles.rideTypeActive]}>
                  <Text style={{ fontSize: 26 }}>{rt.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rideTypeLabel, rideType === rt.id && { color: C.rose }]}>{rt.label}</Text>
                    <Text style={styles.rideTypeDesc}>{rt.desc} · {rt.seats}</Text>
                  </View>
                  <Text style={[styles.rideTypeNote, rideType === rt.id && { color: C.rose }]}>{rt.note}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Mood */}
          <View>
            <Text style={styles.sectionTitle}>🎭 Ride Mood Preference</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {MOODS.map(m => (
                <TouchableOpacity key={m.id} onPress={() => setMood(m.id)}
                  style={[styles.moodCard, mood === m.id && styles.moodCardActive]}>
                  <Text style={{ fontSize: 22 }}>{m.icon}</Text>
                  <Text style={[styles.moodLabel, mood === m.id && { color: C.rose }]}>{m.label}</Text>
                  <Text style={styles.moodDesc}>{m.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Pooling */}
          <View style={[styles.poolCard, pooling && styles.poolCardActive]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.poolTitle}>👯‍♀️ Allow Ride Pooling</Text>
              <Text style={styles.poolDesc}>Share with up to 2 verified women going your way</Text>
              {pooling && route?.poolFare != null && (
                <Text style={styles.poolNote}>
                  If a passenger joins: about Rs {route.poolFare}. If nobody joins, you pay the normal fare (Rs {route.fare.total}).
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setPooling(!pooling)}
              style={[styles.poolToggle, pooling && styles.poolToggleActive]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{pooling ? 'ON ✓' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>

          {/* Fare — calculated by the server for the chosen route */}
          {fare && route && (
            <View style={styles.fareCard}>
              <Text style={styles.sectionTitle}>💰 Fare Estimate</Text>
              {[
                { lbl: 'Base fare',                                   val: `Rs ${fare.baseFare}` },
                { lbl: `Distance (${route.distanceKm} km)`,           val: `Rs ${fare.distanceFare}` },
                { lbl: `Time (about ${route.durationMin} min)`,       val: `Rs ${fare.timeFare}` },
                ...(fare.surcharge ? [{ lbl: 'Vehicle type', val: `${fare.surcharge > 0 ? '+' : '−'} Rs ${Math.abs(fare.surcharge)}` }] : []),
              ].map((row, i) => (
                <View key={i} style={styles.fareRow}>
                  <Text style={[styles.fareLabel, row.green && { color: C.success }]}>{row.lbl}</Text>
                  <Text style={[styles.fareValue, row.green && { color: C.success }]}>{row.val}</Text>
                </View>
              ))}
              <View style={[styles.fareRow, styles.fareTotalRow]}>
                <Text style={styles.fareTotalLabel}>Total (estimate)</Text>
                <Text style={styles.fareTotal}>Rs {fare.total}</Text>
              </View>
              {pooling && route.poolFare != null && (
                <View style={styles.fareRow}>
                  <Text style={[styles.fareLabel, { color: C.success }]}>If pooled with one passenger</Text>
                  <Text style={[styles.fareValue, { color: C.success }]}>about Rs {route.poolFare}</Text>
                </View>
              )}
              <Text style={styles.hint}>Final fare is calculated from the actual trip distance and time.</Text>
            </View>
          )}

          <PrimaryBtn
            title={booking ? 'Booking…' : fare ? `Book Ride — Rs ${fare.total} 🌸` : 'Book Ride'}
            onPress={handleBook}
            loading={booking}
            disabled={!pickup || !dropoff || !route || estimate.loading}
          />
          <Text style={styles.attribution}>Map data © OpenStreetMap contributors · Routing by OSRM</Text>
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

  infoBanner:       { flexDirection: 'row', alignItems: 'center', margin: 14, marginBottom: 0, padding: 10, borderRadius: 12, backgroundColor: C.infoBg },
  infoRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  infoText:         { fontSize: 12, color: C.text, flexShrink: 1 },
  warnBanner:       { margin: 14, marginBottom: 0, padding: 12, borderRadius: 12, backgroundColor: '#FFF4D6', borderWidth: 1, borderColor: '#E0A800' },
  warnText:         { fontSize: 13, color: '#5C4300', fontWeight: '600' },
  warnSub:          { fontSize: 11, color: '#7A5A00', marginTop: 3 },
  warnInline:       { fontSize: 12, color: '#7A5A00', marginBottom: 8 },
  smallBtn:         { borderWidth: 1.5, borderColor: C.rose, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.white },
  smallBtnText:     { color: C.rose, fontWeight: '700', fontSize: 12 },

  locationCard:     { margin: 14, backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14 },
  pointRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider:          { height: 1, backgroundColor: C.border, marginLeft: 22 },
  dot:              { width: 10, height: 10, borderRadius: 5 },
  pointLabel:       { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 0.6 },
  pointName:        { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 2 },
  pointAddr:        { fontSize: 11, color: C.muted, marginTop: 1 },
  pointPlaceholder: { fontSize: 14, color: C.muted, marginTop: 2 },
  editText:         { fontSize: 12, fontWeight: '700', color: C.rose },

  searchPanel:      { marginHorizontal: 14, marginBottom: 14, backgroundColor: C.white, borderRadius: 18, borderWidth: 1.5, borderColor: C.rose, padding: 14 },
  searchRow:        { flexDirection: 'row', gap: 8 },
  searchInput:      { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text },
  searchBtn:        { backgroundColor: C.rose, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', minWidth: 78, alignItems: 'center' },
  searchBtnText:    { color: '#fff', fontWeight: '700', fontSize: 13 },
  searchActions:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip:             { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.rosePale },
  chipText:         { fontSize: 12, color: C.rose, fontWeight: '700' },
  errorText:        { fontSize: 12, color: '#B03A2E', marginTop: 10 },
  resultRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, marginTop: 8 },
  resultName:       { fontSize: 13, fontWeight: '700', color: C.text },
  resultAddr:       { fontSize: 11, color: C.muted, marginTop: 1 },
  resultDist:       { fontSize: 11, color: C.muted, fontWeight: '600' },
  attribution:      { fontSize: 9, color: C.muted, marginTop: 8, textAlign: 'center' },

  mapContainer:     { marginHorizontal: 14, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  map:              { height: 260 },
  mapBanner:        { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(92,20,72,0.92)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  mapBannerText:    { color: '#fff', fontWeight: '700', fontSize: 12, flex: 1 },
  mapBannerCancel:  { color: '#FFD3E2', fontWeight: '800', fontSize: 12, marginLeft: 10 },

  sectionTitle:     { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },
  routeCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 16, borderWidth: 2, borderColor: C.border, backgroundColor: C.white, marginBottom: 8 },
  routeCardActive:  { borderColor: C.rose, backgroundColor: C.rosePale },
  routeSwatch:      { width: 6, alignSelf: 'stretch', borderRadius: 3 },
  routeTitle:       { fontSize: 13, fontWeight: '700', color: C.text },
  routeSub:         { fontSize: 12, color: C.muted, marginTop: 2 },
  routeFare:        { fontSize: 14, fontWeight: '800', color: C.text },
  check:            { width: 22, height: 22, borderRadius: 11, backgroundColor: C.rose, alignItems: 'center', justifyContent: 'center' },
  hint:             { fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 16 },

  rideTypeCard:     { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 18, borderWidth: 2, borderColor: C.border, backgroundColor: C.white },
  rideTypeActive:   { borderColor: C.rose, backgroundColor: C.rosePale },
  rideTypeLabel:    { fontSize: 14, fontWeight: '700', color: C.text },
  rideTypeDesc:     { fontSize: 11, color: C.muted, marginTop: 2 },
  rideTypeNote:     { fontSize: 12, fontWeight: '700', color: C.muted },

  moodCard:         { flex: 1, borderRadius: 14, borderWidth: 2, borderColor: C.border, backgroundColor: C.white, padding: 10, alignItems: 'center', gap: 4 },
  moodCardActive:   { borderColor: C.rose, backgroundColor: C.rosePale },
  moodLabel:        { fontSize: 12, fontWeight: '700', color: C.text },
  moodDesc:         { fontSize: 10, color: C.muted },

  poolCard:         { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: C.border },
  poolCardActive:   { borderColor: C.rose, backgroundColor: C.rosePale },
  poolTitle:        { fontSize: 14, fontWeight: '700', color: C.text },
  poolDesc:         { fontSize: 11, color: C.muted, marginTop: 2 },
  poolNote:         { fontSize: 11, color: C.success, marginTop: 6, fontWeight: '600', lineHeight: 16 },
  poolToggle:       { backgroundColor: C.muted, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  poolToggleActive: { backgroundColor: C.rose },

  fareCard:         { backgroundColor: C.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border },
  fareRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  fareLabel:        { fontSize: 12, color: C.muted },
  fareValue:        { fontSize: 12, color: C.text, fontWeight: '600' },
  fareTotalRow:     { borderTopWidth: 2, borderTopColor: C.rose, marginTop: 6, paddingTop: 10 },
  fareTotalLabel:   { fontSize: 14, fontWeight: '800', color: C.text },
  fareTotal:        { fontSize: 20, fontWeight: '900', color: C.rose },
});
