// src/screens/safety/SafePointsScreen.js
// Real safe points: police stations, hospitals and busy public places near you
// (OpenStreetMap), plus search and tap-on-map. During a ride (route.params.rideId)
// the passenger can mark points on the trip and ask the driver to take her to
// one — the driver gets the location and a road route to it.
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, ActivityIndicator, Alert, Linking } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import OSMMap from '../../components/OSMMap';
import { geoAPI, rideAPI } from '../../services/api';
import { onEvent } from '../../services/socket';
import { C } from '../../utils/theme';

const TYPE = {
  police:   { ico: '👮', label: 'Police',       color: C.info,    bg: C.infoBg },
  hospital: { ico: '🏥', label: 'Hospital',     color: '#CC2222', bg: '#FFEBEE' },
  public:   { ico: '🏪', label: 'Public place', color: C.success, bg: C.successBg },
  other:    { ico: '📍', label: 'Marked place', color: C.plum,    bg: C.plumLight },
};
const errMsg = (e) => e.response?.data?.message || 'Could not reach the server.';

export default function SafePointsScreen({ navigation, route }) {
  const { rideId } = route?.params || {};
  const [here,     setHere]     = useState(null);       // { latitude, longitude }
  const [filter,   setFilter]   = useState('all');
  const [places,   setPlaces]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState(null);       // a place not yet saved
  const [saved,    setSaved]    = useState([]);         // ride.safePoints
  const [request,  setRequest]  = useState(null);       // { point, route, acknowledged }

  // Current position (real GPS only — nothing is assumed)
  useEffect(() => {
    Geolocation.getCurrentPosition(
      p => setHere({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => setError('GPS unavailable — search for a place or tap the map to mark one.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
    if (rideId) rideAPI.getById(rideId).then(r => {
      setSaved(r.ride?.safePoints || []);
      if (!here && r.ride?.pickupLocation?.coordinates) {
        const [lng, lat] = r.ride.pickupLocation.coordinates;
        setHere(h => h || { latitude: lat, longitude: lng });
      }
    }).catch(() => {});
    const off = onEvent('ride:safe-point-acknowledged', d => {
      if (String(d?.rideId) === String(rideId)) setRequest(r => r && { ...r, acknowledged: true });
    });
    return () => off && off();
  }, []);

  const loadNearby = async (center = here, type = filter) => {
    if (!center) return;
    setLoading(true); setError(null);
    try {
      const res = await geoAPI.safePlaces(center, type === 'all' ? undefined : type);
      setPlaces(res.places || []);
      if (!res.places?.length) setError('No named safe places found nearby. Search, or tap the map to mark one.');
    } catch (e) { setError(errMsg(e)); }
    setLoading(false);
  };
  useEffect(() => { loadNearby(); }, [here, filter]);

  const search = async () => {
    if (query.trim().length < 3) return;
    setLoading(true); setError(null);
    try {
      const res = await geoAPI.search(query.trim(), here);
      setPlaces((res.places || []).map(p => ({ ...p, type: 'other', source: 'search' })));
      if (!res.places?.length) setError('Nothing found for that search.');
    } catch (e) { setError(errMsg(e)); }
    setLoading(false);
  };

  const pinOnMap = async ({ latitude, longitude }) => {
    setSelected({ name: 'Pinned location', address: 'Finding address…', lat: latitude, lng: longitude, type: 'other', source: 'map' });
    try {
      const r = await geoAPI.reverse({ latitude, longitude });
      setSelected(s => s && s.lat === latitude ? { ...s, name: r.place?.name || s.name, address: r.place?.address || '' } : s);
    } catch { setSelected(s => s && { ...s, address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` }); }
  };

  const save = async (p) => {
    if (!rideId) return;
    try {
      const res = await rideAPI.addSafePoint(rideId, {
        name: p.name, type: ['police', 'hospital', 'public'].includes(p.type) ? p.type : 'other',
        address: p.address, coordinates: [p.lng, p.lat], source: p.source || 'osm',
      });
      setSaved(res.safePoints); setSelected(null);
    } catch (e) { Alert.alert('Not saved', errMsg(e)); }
  };

  const remove = async (pt) => {
    try { setSaved((await rideAPI.removeSafePoint(rideId, pt._id)).safePoints); }
    catch (e) { Alert.alert('Not removed', errMsg(e)); }
  };

  const takeMeThere = (pt) => Alert.alert('Go to this safe point?', `Your driver will be asked to take you to:\n\n${pt.name}`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes, go there', onPress: async () => {
      try {
        const res = await rideAPI.requestSafePoint(rideId, pt._id);
        setRequest({ point: res.point, route: res.route, acknowledged: false });
      } catch (e) { Alert.alert('Request failed', errMsg(e)); }
    } },
  ]);

  const openInMaps = (lat, lng) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);

  // Map: you, nearby places, saved points (bigger), the pin, and the route to a requested point
  const markers = [
    ...(here ? [{ id: 'me', ...here, label: 'You', color: '#2D7FF9' }] : []),
    ...places.slice(0, 25).map(p => ({ id: p.id, latitude: p.lat, longitude: p.lng, label: p.name, emoji: TYPE[p.type]?.ico || '📍' })),
    ...saved.map(s => ({ id: `saved-${s._id}`, latitude: s.coordinates[1], longitude: s.coordinates[0], label: `⭐ ${s.name}`, emoji: '⭐' })),
    ...(selected ? [{ id: 'pin', latitude: selected.lat, longitude: selected.lng, label: selected.name, emoji: '📌' }] : []),
  ];
  const routes = request?.route?.coordinates ? [{ id: 'to-safe', coordinates: request.route.coordinates, color: C.success, weight: 5 }] : [];
  const savedKey = (p) => saved.some(s => Math.abs(s.coordinates[1] - p.lat) < 1e-5 && Math.abs(s.coordinates[0] - p.lng) < 1e-5);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><Text style={{ fontSize: 18, color: C.rose }}>←</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.hdrTitle}>Safe Points 📍</Text>
          <Text style={{ fontSize: 10, color: C.muted }}>{rideId ? 'Mark places for this ride · tap the map to pin one' : 'Real places near you (OpenStreetMap)'}</Text>
        </View>
      </View>

      <OSMMap style={s.map} center={here || undefined} zoom={15} markers={markers} routes={routes}
        fitToContent={!!request} fitKey={request ? `req-${request.point?._id}` : undefined}
        onMapPress={rideId ? pinOnMap : undefined} />

      {/* Request status — navigation info */}
      {request && (
        <View style={s.request}>
          <Text style={s.requestTitle}>🧭 Going to: {request.point.name}</Text>
          <Text style={s.requestSub}>
            {request.route ? `${request.route.distanceKm} km from your driver${request.route.durationMin ? ` · ~${request.route.durationMin} min` : ''}` : 'Driver location unknown — route not available'}
          </Text>
          <Text style={[s.requestSub, { color: request.acknowledged ? C.success : '#B07030', fontWeight: '700' }]}>
            {request.acknowledged ? '✅ Your driver acknowledged the request' : '⏳ Waiting for your driver to acknowledge…'}
          </Text>
          <Text style={s.requestHint}>If the driver does not respond, use SOS.</Text>
        </View>
      )}

      {/* Pinned point not saved yet */}
      {selected && (
        <View style={s.request}>
          <Text style={s.requestTitle}>📌 {selected.name}</Text>
          <Text style={s.requestSub} numberOfLines={2}>{selected.address}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity onPress={() => save(selected)} style={[s.btn, { backgroundColor: C.rose }]}><Text style={s.btnText}>⭐ Mark as safe point</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setSelected(null)} style={[s.btn, { backgroundColor: C.border }]}><Text style={[s.btnText, { color: C.text }]}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
        {/* Saved for this ride */}
        {rideId && (
          <View>
            <Text style={s.section}>⭐ MY SAFE POINTS FOR THIS RIDE ({saved.length})</Text>
            {saved.length === 0 && <Text style={s.empty}>None yet — pick a place below, search, or tap the map.</Text>}
            {saved.map(pt => (
              <View key={pt._id} style={[s.card, { borderColor: C.rose }]}>
                <Text style={{ fontSize: 22 }}>{TYPE[pt.type]?.ico || '📍'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{pt.name}</Text>
                  {!!pt.address && <Text style={s.addr} numberOfLines={1}>{pt.address}</Text>}
                </View>
                <TouchableOpacity onPress={() => takeMeThere(pt)} style={[s.btn, { backgroundColor: C.success }]}><Text style={s.btnText}>Go here</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => remove(pt)}><Text style={{ color: C.muted, fontSize: 18, paddingHorizontal: 4 }}>✕</Text></TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Search */}
        <View style={s.searchRow}>
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder="Search a place (e.g. Services Hospital)"
            placeholderTextColor={C.muted} style={s.search} returnKeyType="search" />
          <TouchableOpacity onPress={search} style={[s.btn, { backgroundColor: C.plum }]}><Text style={s.btnText}>Search</Text></TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[['all', 'All nearby'], ['police', '👮 Police'], ['hospital', '🏥 Hospitals'], ['public', '🏪 Public places']].map(([id, lbl]) => (
            <TouchableOpacity key={id} onPress={() => { setQuery(''); setFilter(id); }} style={[s.filter, filter === id && s.filterActive]}>
              <Text style={[s.filterTxt, filter === id && { color: C.rose }]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading && <ActivityIndicator color={C.rose} />}
        {!!error && !loading && <Text style={s.empty}>{error}</Text>}

        {places.map(p => {
          const t = TYPE[p.type] || TYPE.other;
          return (
            <View key={p.id} style={s.card}>
              <View style={[s.icon, { backgroundColor: t.bg }]}><Text style={{ fontSize: 22 }}>{t.ico}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{p.name}</Text>
                <Text style={s.addr} numberOfLines={1}>{p.address || t.label}</Text>
                <Text style={[s.addr, { color: t.color, fontWeight: '700' }]}>
                  {p.distanceKm != null ? `${p.distanceKm} km` : ''}{p.openingHours ? ` · ⏰ ${p.openingHours}` : ''}
                </Text>
              </View>
              {rideId
                ? (savedKey(p)
                    ? <Text style={{ color: C.rose, fontWeight: '700', fontSize: 12 }}>⭐ Saved</Text>
                    : <TouchableOpacity onPress={() => save(p)} style={[s.btn, { backgroundColor: t.bg }]}><Text style={[s.btnText, { color: t.color }]}>⭐ Mark</Text></TouchableOpacity>)
                : <TouchableOpacity onPress={() => openInMaps(p.lat, p.lng)} style={[s.btn, { backgroundColor: t.bg }]}><Text style={[s.btnText, { color: t.color }]}>Directions</Text></TouchableOpacity>}
            </View>
          );
        })}
        <Text style={s.credit}>Place data © OpenStreetMap contributors</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  hdr:        { backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingTop: 44, borderBottomWidth: 1, borderBottomColor: C.border },
  back:       { backgroundColor: C.rosePale, borderRadius: 12, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  hdrTitle:   { fontSize: 16, fontWeight: '800', color: C.text },
  map:        { height: 230 },
  request:    { backgroundColor: '#fff', margin: 10, marginBottom: 0, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: C.success },
  requestTitle:{ fontSize: 13, fontWeight: '800', color: C.text },
  requestSub: { fontSize: 11, color: C.muted, marginTop: 3 },
  requestHint:{ fontSize: 10, color: C.muted, marginTop: 4, fontStyle: 'italic' },
  section:    { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1, marginBottom: 6 },
  empty:      { fontSize: 12, color: C.muted, textAlign: 'center', marginVertical: 6 },
  searchRow:  { flexDirection: 'row', gap: 8 },
  search:     { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, fontSize: 13, color: C.text, height: 42 },
  filter:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.white, marginRight: 8 },
  filterActive:{ borderColor: C.rose, backgroundColor: C.rosePale },
  filterTxt:  { fontSize: 12, fontWeight: '600', color: C.muted },
  card:       { backgroundColor: C.white, borderRadius: 16, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 2 },
  icon:       { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  name:       { fontSize: 13, fontWeight: '700', color: C.text },
  addr:       { fontSize: 11, color: C.muted, marginTop: 2 },
  btn:        { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText:    { fontWeight: '700', fontSize: 12, color: '#fff' },
  credit:     { fontSize: 9, color: C.muted, textAlign: 'center', marginTop: 6 },
});
