// src/screens/shared/AdminDriverApprovalScreen.js
// Admin screen: view pending drivers, run background check, approve/reject

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
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
  const [stats,     setStats]   = useState(null);
  const [loading,   setLoading] = useState(false);

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
        const r = await adminAPI.get('/sos-incidents');
        setIncidents(r.incidents || []);
      } else if (tab === 'active') {
        const r = await adminAPI.get('/active-rides');
        setRides(r.rides || DEMO_ACTIVE_RIDES);
      } else if (tab === 'stats') {
        const r = await adminAPI.get('/stats');
        setStats(r.stats);
      }
    } catch (_) {
      // Demo data if backend not running
      if (tab === 'pending') setDrivers(DEMO_DRIVERS);
      if (tab === 'stats')   setStats(DEMO_STATS);
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
            } catch (_) {
              Alert.alert('Approved (Demo)', `${driver.name} would be activated in production.`);
              setDrivers(prev => prev.filter(d => d._id !== driver._id));
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
            } catch (_) {
              setDrivers(prev => prev.filter(d => d._id !== driver._id));
            }
          },
        },
      ]
    );
  };

  const TABS = [
    { id: 'pending',    label: '⏳ Pending',    color: C.gold   },
    { id: 'background', label: '🔍 Background', color: C.info   },
    { id: 'fake',       label: '🚨 Fake Rides', color: C.danger },
    { id: 'sos',        label: '🆘 SOS',        color: '#E74C3C' },
    { id: 'stats',      label: '📊 Stats',      color: C.plum   },
  ];

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#1A1A2E', '#16213E']} style={styles.header}>
        <TouchableOpacity onPress={() => {
          Alert.alert('Logout', 'Sign out of admin panel?', [
            { text: 'Cancel' },
            { text: 'Logout', onPress: async () => { await logout(); navigation.replace('Login'); }},
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
                        { lbl: 'Background Check',    pass: d.driverDetails?.backgroundCheck==='passed', val: d.driverDetails?.backgroundCheck || 'pending' },
                      ].map((item, i) => (
                        <View key={i} style={styles.checkRow}>
                          <Text style={{ fontSize: 14 }}>{item.pass ? '✅' : '⏳'}</Text>
                          <Text style={styles.checkLabel}>{item.lbl}</Text>
                          <Text style={styles.checkVal}>{item.val}</Text>
                        </View>
                      ))}
                    </View>

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

            {/* FAKE RIDES / SOS INCIDENTS */}
            {(tab === 'fake' || tab === 'sos') && (
              incidents.length === 0
                ? <View style={styles.emptyBox}><Text style={{ fontSize: 40 }}>✅</Text><Text style={styles.emptyText}>No {tab === 'fake' ? 'fake ride' : 'SOS'} incidents</Text></View>
                : incidents.map((inc, i) => (
                  <View key={i} style={[styles.incidentCard, { borderLeftColor: tab === 'sos' ? C.danger : '#E74C3C' }]}>
                    <Text style={styles.incidentTitle}>
                      {tab === 'sos' ? '🆘 SOS Incident' : '🚨 Fake Ride Attempt'}
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

const DEMO_DRIVERS = [
  { _id: 'd1', name: 'Fatima Malik', email: 'fatima@demo.com', phone: '+92300111', cnic: '35202-1234567-8', cnicVerified: true, isVerified: false, driverDetails: { licenseNumber: 'DL-12345', vehicleMake: 'Toyota', vehicleModel: 'Corolla', licensePlate: 'LHR-1234', backgroundCheck: 'pending' } },
  { _id: 'd2', name: 'Ayesha Raza',  email: 'ayesha@demo.com', phone: '+92300222', cnic: '35202-7654321-2', cnicVerified: true, isVerified: false, driverDetails: { licenseNumber: 'DL-67890', vehicleMake: 'Honda',  vehicleModel: 'City',    licensePlate: 'LHR-5678', backgroundCheck: 'pending' } },
];
const DEMO_STATS = { totalUsers: 248, totalDrivers: 32, totalPassengers: 216, pendingDrivers: 5, completedRides: 1240, sosCount: 3, fakeRideCount: 2, deviationCount: 7, totalRevenue: 345800 };

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
});

// ═══════════════════════════════════════════════════════
//  ACTIVE RIDES MONITOR — REQ 24: Admin monitors live rides
//  Appended to AdminDriverApprovalScreen tab "active"
// ═══════════════════════════════════════════════════════

export function ActiveRidesMonitor() {
  const [rides,   setRides]   = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const { default: axios } = require('axios');

  const fetchActive = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/admin/active-rides`);
      setRides(r.data.rides || []);
    } catch (_) {
      setRides(DEMO_ACTIVE_RIDES);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    fetchActive();
    const interval = setInterval(fetchActive, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  if (loading) return <ActivityIndicator color={C.rose} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>🟢 Active Rides ({rides.length})</Text>
        <TouchableOpacity onPress={fetchActive} style={{ backgroundColor: C.rose, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>
      {rides.length === 0 && (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Text style={{ fontSize: 40 }}>🚗</Text>
          <Text style={{ color: C.muted, fontSize: 14, marginTop: 8 }}>No active rides right now</Text>
        </View>
      )}
      {rides.map((ride, i) => (
        <View key={i} style={{
          backgroundColor: '#fff', borderRadius: 16, padding: 14,
          borderWidth: 1, borderColor: C.border, gap: 6,
          borderLeftWidth: 4,
          borderLeftColor: ride.sosActivated ? '#E74C3C' : ride.routeDeviated ? '#F39C12' : '#27AE60'
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }}>
              {ride.sosActivated ? '🆘 SOS ACTIVE' : ride.routeDeviated ? '⚠️ DEVIATION' : '🟢 In Progress'}
            </Text>
            <Text style={{ fontSize: 10, color: C.muted }}>{new Date(ride.startedAt || ride.createdAt).toLocaleTimeString()}</Text>
          </View>
          <Text style={{ fontSize: 12, color: C.text }}>👩 Passenger: {ride.passenger?.name || 'N/A'} · {ride.passenger?.phone || ''}</Text>
          <Text style={{ fontSize: 12, color: C.text }}>🚗 Driver: {ride.driver?.name || 'N/A'} · {ride.driver?.driverDetails?.licensePlate || ''}</Text>
          <Text style={{ fontSize: 11, color: C.muted }}>📍 {ride.pickupLocation?.address || ''} → {ride.dropoffLocation?.address || ''}</Text>
          <Text style={{ fontSize: 11, color: C.muted }}>💰 Est. Fare: Rs. {ride.estimatedFare || 0} · {ride.distanceKm || 0} km</Text>
          {ride.isPooled && <Text style={{ fontSize: 10, color: C.rose, fontWeight: '700' }}>👯‍♀️ Pool Ride</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const DEMO_ACTIVE_RIDES = [
  { passenger: { name: 'Ayesha Khan', phone: '+92300111' }, driver: { name: 'Fatima Malik', driverDetails: { licensePlate: 'LHR-1234' } }, pickupLocation: { address: 'DHA Phase 5' }, dropoffLocation: { address: 'Gulberg III' }, estimatedFare: 280, distanceKm: 7.2, sosActivated: false, routeDeviated: false, createdAt: new Date(), isPooled: false },
  { passenger: { name: 'Sara Ahmed',  phone: '+92300222' }, driver: { name: 'Zainab Ali',   driverDetails: { licensePlate: 'LHR-5678' } }, pickupLocation: { address: 'Model Town'  }, dropoffLocation: { address: 'Liberty Market' }, estimatedFare: 180, distanceKm: 4.1, sosActivated: false, routeDeviated: true,  createdAt: new Date(), isPooled: true  },
];
