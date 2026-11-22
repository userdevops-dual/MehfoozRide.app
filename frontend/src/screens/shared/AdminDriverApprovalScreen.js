// src/screens/shared/AdminDriverApprovalScreen.js
// Admin screen: view pending drivers, run background check, approve/reject

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Image, Modal, TextInput,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import api, { authImage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { C, GRAD } from '../../utils/theme';

// Admin API helper — attaches token automatically via api interceptor
const adminAPI = {
  get:  (path) => api.get(`/admin${path}`).then(r => r.data),
  put:  (path, data) => api.put(`/admin${path}`, data).then(r => r.data),
  post: (path, data) => api.post(`/admin${path}`, data).then(r => r.data),
};

export default function AdminDriverApprovalScreen({ navigation }) {
  const { logout } = useAuth();
  const [tab,       setTab]     = useState('pending');
  const [drivers,   setDrivers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [rides,     setRides]   = useState([]);
  const [stats,     setStats]   = useState(null);
  const [loading,   setLoading] = useState(false);
  const [complaints, setComplaints] = useState([]);
  const [sessions,  setSessions]  = useState([]);
  const [viewer,    setViewer]    = useState(null);   // { title, path } of a document photo
  const [notes,     setNotes]     = useState({});     // complaintId → admin notes

  useEffect(() => { fetchData(); }, [tab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (tab === 'pending') {
        const r = await adminAPI.get('/drivers/pending');
        setDrivers(r.drivers || []);
      } else if (tab === 'background') {
        const r = await adminAPI.get('/drivers/background-review');
        setDrivers(r.drivers || []);
      } else if (tab === 'fake') {
        const r = await adminAPI.get('/fake-ride-incidents');
        setIncidents(r.incidents || []);
      } else if (tab === 'sos') {
        const r = await adminAPI.get('/emergencies');
        setSessions(r.sessions || []);
      } else if (tab === 'complaints') {
        const r = await adminAPI.get('/complaints');
        setComplaints(r.complaints || []);
      } else if (tab === 'active') {
        const r = await adminAPI.get('/active-rides');
        setRides(r.rides || []);
      } else if (tab === 'stats') {
        const r = await adminAPI.get('/stats');
        setStats(r.stats);
      }
    } catch (err) {
      Alert.alert('Could not load', err.response?.data?.message || 'Server error. Is the backend running?');
    }
    setLoading(false);
  };

  const handleApprove = (driver) => {
    Alert.alert(
      '✅ Approve Driver',
      `Approve ${driver.name}?\n\nChecklist:\n✓ CNIC: ${driver.cnic || 'N/A'}\n✓ License: ${driver.driverDetails?.licenseNumber || 'N/A'}\n✓ Vehicle: ${driver.driverDetails?.vehicleMake} ${driver.driverDetails?.vehicleModel}\n✓ Plate: ${driver.driverDetails?.licensePlate || 'N/A'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '✅ Approve & Activate',
          onPress: async () => {
            try {
              await adminAPI.put(`/drivers/${driver._id}/approve`, {
                backgroundNotes: 'Verified by admin — CNIC, license and vehicle confirmed',
                criminalDeclaration: true,
              });
              Alert.alert('Done', `${driver.name} approved! They can now accept rides.`);
              fetchData();
            } catch (err) {
              Alert.alert('Not Approved', err.response?.data?.message || 'Server error. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleReject = (driver) => {
    Alert.alert(
      '❌ Reject Driver',
      `Reject & suspend ${driver.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '❌ Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminAPI.put(`/drivers/${driver._id}/reject-background`, {
                reason: 'Background check failed — admin review',
              });
              fetchData();
            } catch (err) {
              Alert.alert('Not Rejected', err.response?.data?.message || 'Server error. Please try again.');
            }
          },
        },
      ]
    );
  };

  const setComplaintStatus = async (c, status) => {
    try {
      await adminAPI.put(`/complaints/${c._id}`, { status, adminNotes: notes[c._id] ?? c.adminNotes ?? '' });
      fetchData();
    } catch (err) {
      Alert.alert('Not saved', err.response?.data?.message || 'Server error. Please try again.');
    }
  };

  // Document photos the driver has on file (admin-only endpoints)
  const docsOf = (d) => [
    d.cnicImages?.uploadedAt && { title: 'CNIC front', path: `/api/admin/users/${d._id}/cnic/front` },
    d.cnicImages?.uploadedAt && { title: 'CNIC back',  path: `/api/admin/users/${d._id}/cnic/back` },
    d.driverDetails?.licensePhoto && { title: 'Driving licence', path: `/api/admin/users/${d._id}/doc/license` },
    d.driverDetails?.registrationPhoto && { title: 'Vehicle registration', path: `/api/admin/users/${d._id}/doc/registration` },
    d.profilePhoto && { title: 'Profile photo', path: `/api/admin/users/${d._id}/doc/profile` },
  ].filter(Boolean);

  const TABS = [
    { id: 'pending',    label: '⏳ Pending',    color: C.gold   },
    { id: 'background', label: '🔍 Background', color: C.info   },
    { id: 'fake',       label: '🚨 Fake Rides', color: C.danger },
    { id: 'sos',        label: '🆘 SOS',        color: '#E74C3C' },
    { id: 'complaints', label: '📝 Complaints', color: '#B07030' },
    { id: 'active',     label: '🟢 Live Rides', color: C.success },
    { id: 'stats',      label: '📊 Stats',      color: C.plum   },
  ];

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#1A1A2E', '#16213E']} style={styles.header}>
        <TouchableOpacity onPress={() => {
          Alert.alert('Logout', 'Sign out of admin panel?', [
            { text: 'Cancel' },
            { text: 'Logout', onPress: logout },
          ]);
        }} style={styles.backBtn}>
          <Text style={{ color: '#fff', fontSize: 16 }}>🚪 Logout</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🛡️ Mehfooz Admin Panel</Text>
        <Text style={styles.headerSub}>Driver approvals, safety incidents & stats</Text>
      </LinearGradient>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} onPress={() => setTab(t.id)}
            style={[styles.tab, tab === t.id && { borderBottomColor: t.color, borderBottomWidth: 2.5 }]}>
            <Text style={[styles.tabText, tab === t.id && { color: t.color }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Full-size document photo */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setViewer(null)} style={styles.viewerBg}>
          <Text style={styles.viewerTitle}>{viewer?.title}</Text>
          {viewer && <Image source={authImage(viewer.path)} style={styles.viewerImg} resizeMode="contain" />}
          <Text style={styles.viewerHint}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>

      {loading
        ? <ActivityIndicator color={C.rose} size="large" style={{ marginTop: 60 }} />
        : (
          <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}>

            {/* ACTIVE RIDES TAB */}
            {tab === 'active' && (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>🟢 Live Rides ({rides?.length || 0})</Text>
                  <TouchableOpacity onPress={fetchData} style={{ backgroundColor: C.rose, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>↻ Refresh</Text>
                  </TouchableOpacity>
                </View>
                {(rides || []).length === 0 && (
                  <View style={styles.emptyBox}><Text style={{ fontSize: 40 }}>🚗</Text><Text style={styles.emptyText}>No active rides right now</Text></View>
                )}
                {(rides || []).map((ride, i) => (
                  <View key={i} style={[styles.incidentCard, { borderLeftColor: ride.sosActivated ? '#E74C3C' : ride.routeDeviated ? '#F39C12' : '#27AE60' }]}>
                    <Text style={styles.incidentTitle}>{ride.sosActivated ? '🆘 SOS ACTIVE' : ride.routeDeviated ? '⚠️ Route Deviation' : '🟢 In Progress'}</Text>
                    <Text style={styles.incidentRow}>👩 Passenger: {ride.passenger?.name} · {ride.passenger?.phone}</Text>
                    <Text style={styles.incidentRow}>🚗 Driver: {ride.driver?.name} · {ride.driver?.driverDetails?.licensePlate}</Text>
                    <Text style={styles.incidentRow}>📍 {ride.pickupLocation?.address} → {ride.dropoffLocation?.address}</Text>
                    <Text style={styles.incidentRow}>💰 Rs.{ride.estimatedFare} · {ride.distanceKm}km{ride.isPooled ? ' · 👯‍♀️ Pool' : ''}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* STATS TAB */}
            {tab === 'stats' && stats && (
              <>
                <View style={styles.statsGrid}>
                  {[
                    { ico: '👩', lbl: 'Total Users',    val: stats.totalUsers,     color: C.rose   },
                    { ico: '🚗', lbl: 'Drivers',        val: stats.totalDrivers,   color: C.plum   },
                    { ico: '⏳', lbl: 'Pending Approval',val: stats.pendingDrivers, color: C.gold   },
                    { ico: '✅', lbl: 'Completed Rides', val: stats.completedRides, color: C.success},
                    { ico: '🆘', lbl: 'SOS Incidents',  val: stats.sosCount,       color: C.danger },
                    { ico: '🚨', lbl: 'Fake Rides',     val: stats.fakeRideCount,  color: '#E74C3C'},
                    { ico: '⚠️', lbl: 'Route Deviations',val: stats.deviationCount,color: C.info   },
                    { ico: '💰', lbl: 'Revenue (Rs.)',  val: stats.totalRevenue,   color: C.success},
                  ].map(s => (
                    <View key={s.lbl} style={[styles.statCard, { borderLeftColor: s.color }]}>
                      <Text style={{ fontSize: 22 }}>{s.ico}</Text>
                      <Text style={[styles.statVal, { color: s.color }]}>{s.val?.toLocaleString?.() ?? s.val}</Text>
                      <Text style={styles.statLbl}>{s.lbl}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* PENDING / BACKGROUND DRIVERS */}
            {(tab === 'pending' || tab === 'background') && (
              drivers.length === 0
                ? <View style={styles.emptyBox}><Text style={{ fontSize: 40 }}>✅</Text><Text style={styles.emptyText}>No drivers pending review</Text></View>
                : drivers.map(d => (
                  <View key={d._id} style={styles.driverCard}>
                    <View style={styles.driverHeader}>
                      <View style={styles.driverAvatar}><Text style={{ fontSize: 26 }}>👩</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.driverName}>{d.name}</Text>
                        <Text style={styles.driverEmail}>{d.email}</Text>
                        <Text style={styles.driverPhone}>{d.phone}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: d.isVerified ? '#D5F5E3' : '#FEF9E7' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: d.isVerified ? '#27AE60' : '#F39C12' }}>
                          {d.isVerified ? '✓ ACTIVE' : '⏳ PENDING'}
                        </Text>
                      </View>
                    </View>

                    {/* Background Check Checklist */}
                    <View style={styles.checklist}>
                      <Text style={styles.checklistTitle}>📋 Background Check</Text>
                      {[
                        { lbl: 'CNIC Verified',       pass: d.cnicVerified,                          val: d.cnic || 'Not provided' },
                        { lbl: 'Driving License',     pass: !!d.driverDetails?.licenseNumber,        val: d.driverDetails?.licenseNumber || '—' },
                        { lbl: 'Vehicle Registration',pass: !!d.driverDetails?.licensePlate,         val: d.driverDetails?.licensePlate || '—' },
                        { lbl: 'Vehicle',             pass: !!d.driverDetails?.vehicleMake,          val: `${d.driverDetails?.vehicleMake || ''} ${d.driverDetails?.vehicleModel || ''}`.trim() || '—' },
                        { lbl: 'Licence photo',       pass: !!d.driverDetails?.licensePhoto,         val: d.driverDetails?.licensePhoto ? 'uploaded' : 'missing' },
                        { lbl: 'Registration photo',  pass: !!d.driverDetails?.registrationPhoto,    val: d.driverDetails?.registrationPhoto ? 'uploaded' : 'missing' },
                        { lbl: 'Background Check',    pass: d.driverDetails?.backgroundCheck==='passed', val: d.driverDetails?.backgroundCheck || 'pending' },
                      ].map((item, i) => (
                        <View key={i} style={styles.checkRow}>
                          <Text style={{ fontSize: 14 }}>{item.pass ? '✅' : '⏳'}</Text>
                          <Text style={styles.checkLabel}>{item.lbl}</Text>
                          <Text style={styles.checkVal}>{item.val}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Document photos — tap to view */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {docsOf(d).length === 0 && <Text style={styles.checkVal}>No document photos uploaded yet</Text>}
                      {docsOf(d).map(doc => (
                        <TouchableOpacity key={doc.path} onPress={() => setViewer(doc)} style={styles.docThumbBox}>
                          <Image source={authImage(doc.path)} style={styles.docThumb} />
                          <Text style={styles.docThumbLabel} numberOfLines={1}>{doc.title}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <View style={styles.actionRow}>
                      <TouchableOpacity onPress={() => handleApprove(d)} style={styles.approveBtn}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>✅ Approve & Activate</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleReject(d)} style={styles.rejectBtn}>
                        <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>❌ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
            )}

            {/* SOS EMERGENCY SESSIONS — the incident payload prepared for police/emergency services */}
            {tab === 'sos' && (
              sessions.length === 0
                ? <View style={styles.emptyBox}><Text style={{ fontSize: 40 }}>✅</Text><Text style={styles.emptyText}>No SOS incidents</Text></View>
                : sessions.map(s => {
                  const inc = s.incident || {};
                  const loc = s.lastLocation?.coordinates;
                  return (
                    <View key={s._id} style={[styles.incidentCard, { borderLeftColor: s.status === 'active' ? '#E74C3C' : '#999' }]}>
                      <Text style={styles.incidentTitle}>{s.status === 'active' ? '🆘 SOS ACTIVE' : '✅ Resolved'} · raised by {inc.reporter?.role}</Text>
                      <Text style={styles.incidentRow}>👩 {inc.reporter?.name} · {inc.reporter?.phone}</Text>
                      {inc.driver?.name && <Text style={styles.incidentRow}>🚗 {inc.driver.name} · {inc.driver.phone} · {inc.driver.vehicle} {inc.driver.licensePlate} · {inc.driver.verified ? 'verified' : 'NOT verified'}</Text>}
                      {inc.trip?.rideId && <Text style={styles.incidentRow}>📍 {inc.trip.pickup?.address} → {inc.trip.dropoff?.address}</Text>}
                      {inc.trip?.routeDeviated && <Text style={[styles.incidentRow, { color: '#E74C3C' }]}>⚠️ Driver left the chosen route on this trip</Text>}
                      <Text style={styles.incidentRow}>📡 Last location: {loc ? `${loc[1].toFixed(5)}, ${loc[0].toFixed(5)}` : 'not received'}{s.lastLocation?.at ? ` at ${new Date(s.lastLocation.at).toLocaleTimeString()}` : ''}</Text>
                      <Text style={styles.incidentRow}>👨‍👩‍👧 Contacts: {(s.contactNotifications || []).slice(0, inc.reporter?.emergencyContacts?.length || 5).map(c => `${c.name} (${c.status})`).join(', ') || 'none saved'}</Text>
                      <Text style={styles.incidentRow}>👮 Police: {s.police?.status}{s.police?.detail ? ` — ${s.police.detail}` : ''}</Text>
                      <Text style={[styles.incidentRow, { color: C.muted }]}>{new Date(s.startedAt).toLocaleString()}{s.resolvedAt ? ` · resolved ${new Date(s.resolvedAt).toLocaleTimeString()}` : ''}</Text>
                    </View>
                  );
                })
            )}

            {/* PASSENGER COMPLAINTS */}
            {tab === 'complaints' && (
              complaints.length === 0
                ? <View style={styles.emptyBox}><Text style={{ fontSize: 40 }}>✅</Text><Text style={styles.emptyText}>No complaints</Text></View>
                : complaints.map(c => (
                  <View key={c._id} style={[styles.incidentCard, { borderLeftColor: c.complaintStatus === 'pending' ? '#E67E22' : '#999' }]}>
                    <Text style={styles.incidentTitle}>📝 {String(c.complaintType || 'other').replace(/_/g, ' ')} · {c.complaintStatus}</Text>
                    <Text style={styles.incidentRow}>From: {c.ratedBy?.name} · {c.ratedBy?.phone}</Text>
                    <Text style={styles.incidentRow}>Driver: {c.ratedUser?.name} · {c.ratedUser?.driverDetails?.licensePlate} · rating {c.ratedUser?.totalRatings ? Number(c.ratedUser.averageRating).toFixed(1) : 'new'}</Text>
                    {c.ride && <Text style={styles.incidentRow}>Ride: {c.ride.pickupLocation?.address} → {c.ride.dropoffLocation?.address}{c.ride.routeDeviated ? ' · route changed' : ''}{c.ride.sosActivated ? ' · SOS used' : ''}</Text>}
                    <Text style={styles.incidentRow}>Stars given: {'★'.repeat(c.stars)}</Text>
                    {!!c.complaintDetails && <Text style={[styles.incidentRow, { fontStyle: 'italic' }]}>“{c.complaintDetails}”</Text>}
                    <TextInput value={notes[c._id] ?? c.adminNotes ?? ''} onChangeText={v => setNotes(n => ({ ...n, [c._id]: v }))}
                      placeholder="Admin notes" placeholderTextColor="#999" style={styles.notesInput} multiline />
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {['reviewed', 'resolved', 'dismissed'].map(st => (
                        <TouchableOpacity key={st} onPress={() => setComplaintStatus(c, st)}
                          style={[styles.statusBtn, c.complaintStatus === st && { backgroundColor: '#1A1A2E' }]}>
                          <Text style={{ color: c.complaintStatus === st ? '#fff' : '#333', fontSize: 11, fontWeight: '700' }}>{st}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={[styles.incidentRow, { color: C.muted }]}>{new Date(c.createdAt).toLocaleString()}</Text>
                  </View>
                ))
            )}

            {/* FAKE RIDES */}
            {tab === 'fake' && (
              incidents.length === 0
                ? <View style={styles.emptyBox}><Text style={{ fontSize: 40 }}>✅</Text><Text style={styles.emptyText}>No fake ride incidents</Text></View>
                : incidents.map((inc, i) => (
                  <View key={i} style={[styles.incidentCard, { borderLeftColor: '#E74C3C' }]}>
                    <Text style={styles.incidentTitle}>
                      🚨 Fake Ride Attempt
                    </Text>
                    <Text style={styles.incidentRow}>Passenger: {inc.passenger?.name || 'N/A'} · {inc.passenger?.phone || ''}</Text>
                    <Text style={styles.incidentRow}>Driver: {inc.driver?.name || 'N/A'} · {inc.driver?.driverDetails?.licensePlate || ''}</Text>
                    {tab === 'fake' && <Text style={styles.incidentRow}>Wrong OTP Attempts: {inc.otpFailureCount}</Text>}
                    <Text style={styles.incidentRow}>Status: {inc.status}</Text>
                    <Text style={[styles.incidentRow, { color: C.muted }]}>{new Date(inc.createdAt).toLocaleString()}</Text>
                  </View>
                ))
            )}

          </ScrollView>
        )
      }
    </View>
  );
}


const styles = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#F5F5F5' },
  header:         { padding: 20, paddingTop: 50, paddingBottom: 22 },
  backBtn:        { marginBottom: 10 },
  headerTitle:    { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub:      { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 3 },
  tabBar:         { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', maxHeight: 50 },
  tab:            { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:        { fontSize: 12, fontWeight: '600', color: '#888' },
  statsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:       { width: '47%', backgroundColor: '#fff', borderRadius: 14, padding: 14, borderLeftWidth: 4, alignItems: 'center', gap: 4 },
  statVal:        { fontSize: 22, fontWeight: '900' },
  statLbl:        { fontSize: 10, color: '#888', textAlign: 'center' },
  emptyBox:       { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText:      { color: '#888', fontSize: 14 },
  driverCard:     { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#eee', gap: 12 },
  driverHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  driverAvatar:   { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFE4EF', alignItems: 'center', justifyContent: 'center' },
  driverName:     { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  driverEmail:    { fontSize: 11, color: '#888' },
  driverPhone:    { fontSize: 11, color: '#888' },
  statusBadge:    { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  checklist:      { backgroundColor: '#F8F8F8', borderRadius: 14, padding: 12, gap: 6 },
  checklistTitle: { fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 4 },
  checkRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkLabel:     { fontSize: 12, color: '#555', flex: 1 },
  checkVal:       { fontSize: 11, color: '#888', fontWeight: '600' },
  actionRow:      { flexDirection: 'row', gap: 10 },
  approveBtn:     { flex: 1, backgroundColor: '#27AE60', borderRadius: 14, padding: 13, alignItems: 'center' },
  rejectBtn:      { flex: 1, borderRadius: 14, padding: 13, alignItems: 'center', borderWidth: 1.5, borderColor: '#E74C3C', backgroundColor: '#FFF5F5' },
  incidentCard:   { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderLeftWidth: 4, gap: 5 },
  incidentTitle:  { fontSize: 14, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 },
  incidentRow:    { fontSize: 12, color: '#555' },
  docThumbBox:    { width: 96, marginRight: 8, alignItems: 'center' },
  docThumb:       { width: 96, height: 64, borderRadius: 8, backgroundColor: '#eee' },
  docThumbLabel:  { fontSize: 9, color: '#666', marginTop: 3 },
  viewerBg:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  viewerTitle:    { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  viewerImg:      { width: '100%', height: '75%' },
  viewerHint:     { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 10 },
  notesInput:     { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 8, fontSize: 12, color: '#222', minHeight: 40, marginTop: 4 },
  statusBtn:      { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
