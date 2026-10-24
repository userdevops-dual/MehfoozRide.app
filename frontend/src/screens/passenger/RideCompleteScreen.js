// src/screens/passenger/RideCompleteScreen.js
// After the driver ends the ride: the final fare from the server (distance,
// time, pooled discount), the amount payable and its payment status, then the
// rating — overall stars, 5 categories, behaviour feedback, comment, complaint.
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { rideAPI } from '../../services/api';
import { onEvent } from '../../services/socket';
import { C, GRAD } from '../../utils/theme';

const StarRow = ({ rating, setRating, size = 28 }) => (
  <View style={{ flexDirection: 'row', gap: 8 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <TouchableOpacity key={i} onPress={() => setRating(i)} hitSlop={6}>
        <Text style={{ fontSize: size, color: i <= rating ? '#F4C430' : '#DDD' }}>★</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const CATEGORIES = [
  { key: 'safety',          label: 'Safety',          icon: '🛡️' },
  { key: 'respectful',      label: 'Respectful',      icon: '🤝' },
  { key: 'professionalism', label: 'Professionalism', icon: '💼' },
  { key: 'punctuality',     label: 'Punctuality',     icon: '⏰' },
  { key: 'cleanliness',     label: 'Cleanliness',     icon: '✨' },
];
// Must match services/ratings.js TAGS on the server
const TAGS = {
  good: [['safe_driving', 'Safe driving'], ['followed_route', 'Followed my route'], ['polite', 'Polite'], ['respected_mood', 'Respected my mood'], ['clean_car', 'Clean car'], ['on_time', 'On time']],
  bad:  [['unsafe_driving', 'Unsafe driving'], ['route_changed', 'Changed route'], ['rude', 'Rude'], ['ignored_mood', 'Ignored my mood'], ['phone_while_driving', 'Phone while driving'], ['dirty_car', 'Dirty car'], ['late', 'Late']],
};
// Must match Rating.complaintType on the server
const COMPLAINT_TYPES = [
  ['harassment', 'Harassment'], ['unsafe_driving', 'Unsafe driving'], ['rude_behaviour', 'Rude behaviour'],
  ['wrong_route', 'Wrong route'], ['wrong_vehicle', 'Wrong vehicle / driver'], ['vehicle_condition', 'Vehicle condition'],
  ['refused_destination', 'Refused destination'], ['other', 'Other'],
];
const PAYMENT = { due: ['💵 Pay in cash', '#B07030'], collected: ['✅ Payment received', C.success], disputed: ['⚠️ Payment disputed', C.danger] };

export default function RideCompleteScreen({ navigation, route }) {
  const { ride: passed, driver: passedDriver } = route.params || {};
  const [ride,     setRide]     = useState(null);
  const [loadErr,  setLoadErr]  = useState(null);
  const [stars,    setStars]    = useState(0);
  const [cats,     setCats]     = useState({});
  const [tags,     setTags]     = useState([]);
  const [comment,  setComment]  = useState('');
  const [complaint, setComplaint] = useState(false);
  const [complaintType, setComplaintType] = useState('');
  const [details,  setDetails]  = useState('');
  const [sending,  setSending]  = useState(false);
  const [rated,    setRated]    = useState(null);

  // The completed ride is always read from the server
  const load = () => rideAPI.getById(passed?._id)
    .then(r => { setRide(r.ride); if (r.ride?.rating) setRated(r.ride.rating); })
    .catch(e => setLoadErr(e.response?.data?.message || 'Could not load the ride. Check your connection.'));
  useEffect(() => {
    load();
    const off = onEvent('ride:payment-updated', d => { if (String(d?.rideId) === String(passed?._id)) load(); });
    return () => off && off();
  }, []);

  const toggleTag = (t) => setTags(x => x.includes(t) ? x.filter(y => y !== t) : [...x, t]);

  const submit = async () => {
    if (!stars) { Alert.alert('Rate your ride', 'Tap the stars to give an overall rating.'); return; }
    if (complaint && !complaintType) { Alert.alert('Complaint', 'Please choose what the complaint is about.'); return; }
    setSending(true);
    try {
      const res = await rideAPI.rate(ride._id, {
        stars, categoryRatings: cats, tags, comment,
        hasComplaint: complaint, complaintType, complaintDetails: details,
      });
      setRated(res.rating);
    } catch (e) {
      Alert.alert('Not submitted', e.response?.data?.message || 'Could not reach the server. Try again.');
    }
    setSending(false);
  };

  if (!ride) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        {loadErr ? (
          <>
            <Text style={{ color: C.text, textAlign: 'center', marginBottom: 12 }}>{loadErr}</Text>
            <TouchableOpacity onPress={() => { setLoadErr(null); load(); }}><Text style={{ color: C.rose, fontWeight: '700' }}>Try again</Text></TouchableOpacity>
          </>
        ) : <ActivityIndicator color={C.rose} size="large" />}
      </View>
    );
  }

  const b = ride.fareBreakdown || {};
  const s = ride.settlement || {};
  const driver = ride.driver || passedDriver || {};
  const pay = PAYMENT[s.status] || PAYMENT.due;
  const km = ride.billedDistanceKm || ride.distanceKm;
  const total = s.payable ?? ride.farePerPassenger;
  // ride-type surcharge or minimum fare: whatever makes the rows add up to the total
  const adjust = Math.round(total + (b.discount || 0) - (b.baseFare || 0) - (b.distanceFare || 0) - (b.timeFare || 0));

  return (
    <View style={styles.screen}>
      <LinearGradient colors={GRAD.primary} style={styles.header}>
        <Text style={{ fontSize: 44 }}>🏁</Text>
        <Text style={styles.title}>You've arrived safely</Text>
        <Text style={styles.sub}>{ride.dropoffLocation?.address}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {/* Amount payable + payment status */}
        <View style={styles.card}>
          <Text style={styles.label}>AMOUNT PAYABLE</Text>
          <Text style={styles.amount}>Rs {s.payable ?? ride.farePerPassenger}</Text>
          <Text style={[styles.payStatus, { color: pay[1] }]}>{pay[0]}{s.status === 'due' ? ` to ${driver.name || 'your driver'}` : ''}</Text>
          <View style={styles.divider} />
          <Row k="Distance" v={`${km} km ${ride.distanceSource === 'gps' ? '(measured by GPS)' : '(planned route)'}`} />
          <Row k="Time" v={`${ride.durationMinutes || 0} min`} />
          <Row k="Base fare" v={`Rs ${b.baseFare ?? 0}`} />
          <Row k="Distance fare" v={`Rs ${b.distanceFare ?? 0}`} />
          <Row k="Time fare" v={`Rs ${b.timeFare ?? 0}`} />
          {!!adjust && <Row k="Ride type / minimum fare" v={`${adjust > 0 ? '+' : '−'} Rs ${Math.abs(adjust)}`} />}
          {!!b.discount && <Row k="Pooled ride discount" v={`− Rs ${b.discount}`} color={C.success} />}
          <Row k="Total" v={`Rs ${s.payable ?? ride.farePerPassenger}`} bold />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>YOUR DRIVER</Text>
          <Text style={styles.driverName}>👩 {driver.name}</Text>
          <Text style={styles.small}>
            {[driver.driverDetails?.vehicleMake, driver.driverDetails?.vehicleModel].filter(Boolean).join(' ')} · {driver.driverDetails?.licensePlate}
          </Text>
        </View>

        {/* Rating */}
        {rated ? (
          <View style={[styles.card, { alignItems: 'center' }]}>
            <Text style={{ fontSize: 34 }}>🌸</Text>
            <Text style={styles.driverName}>Thanks for your feedback</Text>
            <Text style={{ fontSize: 22, color: '#F4C430', marginTop: 4 }}>{'★'.repeat(rated.stars)}<Text style={{ color: '#DDD' }}>{'★'.repeat(5 - rated.stars)}</Text></Text>
            {rated.hasComplaint && <Text style={[styles.small, { marginTop: 6 }]}>Your complaint was sent to the safety team.</Text>}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>RATE YOUR RIDE</Text>
            <View style={{ alignItems: 'center', marginVertical: 8 }}><StarRow rating={stars} setRating={setStars} size={40} /></View>

            <Text style={styles.section}>How was she on…</Text>
            {CATEGORIES.map(c => (
              <View key={c.key} style={styles.catRow}>
                <Text style={styles.catLabel}>{c.icon} {c.label}</Text>
                <StarRow rating={cats[c.key] || 0} setRating={v => setCats(x => ({ ...x, [c.key]: v }))} size={22} />
              </View>
            ))}

            <Text style={styles.section}>What went well?</Text>
            <View style={styles.tags}>{TAGS.good.map(([k, l]) => <Tag key={k} on={tags.includes(k)} label={l} onPress={() => toggleTag(k)} />)}</View>
            <Text style={styles.section}>Anything wrong?</Text>
            <View style={styles.tags}>{TAGS.bad.map(([k, l]) => <Tag key={k} bad on={tags.includes(k)} label={l} onPress={() => toggleTag(k)} />)}</View>

            <TextInput value={comment} onChangeText={setComment} placeholder="Tell us more (optional)" placeholderTextColor={C.muted}
              multiline maxLength={500} style={styles.input} />

            <TouchableOpacity onPress={() => setComplaint(x => !x)} style={styles.complaintToggle}>
              <Text style={{ color: complaint ? C.danger : C.muted, fontWeight: '700' }}>{complaint ? '☑' : '☐'} Report a safety problem</Text>
            </TouchableOpacity>
            {complaint && (
              <>
                <View style={styles.tags}>{COMPLAINT_TYPES.map(([k, l]) => <Tag key={k} bad on={complaintType === k} label={l} onPress={() => setComplaintType(k)} />)}</View>
                <TextInput value={details} onChangeText={setDetails} placeholder="What happened? (sent to the safety team)" placeholderTextColor={C.muted}
                  multiline maxLength={1000} style={styles.input} />
              </>
            )}

            <TouchableOpacity onPress={submit} disabled={sending} style={styles.submit}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit rating</Text>}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={() => navigation.reset({ index: 0, routes: [{ name: 'PassengerHome' }] })} style={styles.home}>
          <Text style={{ color: C.rose, fontWeight: '800' }}>{rated ? 'Back to home' : 'Skip for now'}</Text>
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const Row = ({ k, v, bold, color }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
    <Text style={{ fontSize: 12, color: C.muted, fontWeight: bold ? '800' : '400' }}>{k}</Text>
    <Text style={{ fontSize: 12, color: color || C.text, fontWeight: bold ? '800' : '600' }}>{v}</Text>
  </View>
);
const Tag = ({ label, on, bad, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[styles.tag, on && { backgroundColor: bad ? C.danger : C.success, borderColor: bad ? C.danger : C.success }]}>
    <Text style={[styles.tagText, on && { color: '#fff' }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: C.bg },
  header:     { alignItems: 'center', paddingTop: 50, paddingBottom: 22, paddingHorizontal: 20 },
  title:      { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  sub:        { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4, textAlign: 'center' },
  card:       { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border },
  label:      { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1 },
  amount:     { fontSize: 34, fontWeight: '900', color: C.text, marginTop: 4 },
  payStatus:  { fontSize: 13, fontWeight: '700', marginTop: 2 },
  divider:    { height: 1, backgroundColor: C.border, marginVertical: 10 },
  driverName: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 4 },
  small:      { fontSize: 11, color: C.muted, marginTop: 2 },
  section:    { fontSize: 12, fontWeight: '800', color: C.text, marginTop: 14, marginBottom: 6 },
  catRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  catLabel:   { fontSize: 12, color: C.text },
  tags:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:        { borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  tagText:    { fontSize: 11, color: C.text, fontWeight: '600' },
  input:      { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10, marginTop: 12, minHeight: 60, color: C.text, textAlignVertical: 'top' },
  complaintToggle: { marginTop: 12 },
  submit:     { backgroundColor: C.rose, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  home:       { alignItems: 'center', padding: 10 },
});
