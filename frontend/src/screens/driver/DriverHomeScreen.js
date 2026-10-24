// frontend/src/screens/driver/DriverHomeScreen.js
// FIXED: Real GPS location emit to backend every 5 seconds when online
import React, {useState, useEffect, useRef} from 'react';
import {View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Geolocation from '@react-native-community/geolocation';
import {useAuth} from '../../context/AuthContext';
import {Badge, Card} from '../../components/UI';
import {emitDriverLocation, onIncomingRide, onDriverStatus} from '../../services/socket';
import {requestLocationPermission} from '../../services/location';
import {driverAPI} from '../../services/api';
import {C, GRAD} from '../../utils/theme';

export default function DriverHomeScreen({navigation}) {
  const {user, logout} = useAuth();
  const [isOnline,     setIsOnline]     = useState(false);
  const [statusKnown,  setStatusKnown]  = useState(false);
  const [gpsError,     setGpsError]     = useState(null);
  const [verification, setVerification] = useState(null);   // from the server
  const [stats,        setStats]        = useState(null);   // rides, earnings, rating — from the server
  const [tab,          setTab]          = useState('home');
  const locationIntervalRef = useRef(null);

  // The server is the source of truth for online/offline
  useEffect(() => {
    driverAPI.getStats()
      .then(res => { setIsOnline(!!res.stats?.isOnline); setVerification(res.stats?.verification || null); setStats(res.stats); })
      .catch(() => {})
      .finally(() => setStatusKnown(true));
    // e.g. after a reconnect, or if the server took the driver offline
    const offStatus = onDriverStatus(({isOnline: online}) => setIsOnline(!!online));
    return () => offStatus && offStatus();
  }, []);

  // Fresh numbers whenever she comes back here (e.g. after finishing a ride)
  useEffect(() => navigation.addListener('focus', () => {
    driverAPI.getStats().then(res => { setStats(res.stats); setVerification(res.stats?.verification || null); }).catch(() => {});
  }), []);

  // Incoming ride requests (sent by the server to nearby drivers).
  // Only open a request while this screen is showing — never mid-ride.
  useEffect(() => {
    const off = onIncomingRide(incoming => {
      if (incoming?.updated) return;          // the request screen handles updates
      if (navigation.isFocused()) navigation.navigate('DriverAcceptRide', {rideData: incoming});
    });
    return () => off && off();
  }, []);

  // Send GPS now and every 5 s while online — matching only uses drivers with a recent position
  useEffect(() => {
    if (!isOnline) return;
    const send = () => Geolocation.getCurrentPosition(
      pos => { setGpsError(null); emitDriverLocation([pos.coords.longitude, pos.coords.latitude]); },
      () => setGpsError('GPS unavailable — you will not get ride requests until your location is found.'),
      {enableHighAccuracy: true, timeout: 5000, maximumAge: 10000}
    );
    send();
    locationIntervalRef.current = setInterval(send, 5000);
    return () => clearInterval(locationIntervalRef.current);
  }, [isOnline]);

  const toggleOnline = async () => {
    const next = !isOnline;
    if (next) {
      const perm = await requestLocationPermission();
      if (perm.error) { Alert.alert('Location Needed', perm.error.message); return; }
    }
    try {
      const res = await driverAPI.setOnline(next);
      setIsOnline(res.isOnline);    // only what the server confirmed
      Alert.alert(res.isOnline ? '🟢 You are Online' : '🔴 You are Offline',
        res.isOnline ? 'Nearby ride requests will appear here.' : 'You will not receive ride requests.');
    } catch (err) {
      Alert.alert('Could Not Update Status', err.response?.data?.message || 'Server error. Your status was not changed.');
    }
  };

  const FEATURES = [
    {ico:'📋', t:'Ride History',  d:'Past rides & earnings',       c:C.info,    bg:C.infoBg,     sc:'RideHistory'},
    {ico:'⭐', t:'My Reviews',   d:'Passenger ratings & feedback', c:C.rose,    bg:C.rosePale,   sc:'Profile'},
    {ico:'💰', t:'My Earnings',  d:'Today, weekly, total',         c:'#B07030', bg:C.goldLight,  sc:'Wallet'},
    {ico:'🛡️', t:'Safety',       d:'SOS, fake call, safe points',  c:C.success, bg:C.successBg,  sc:'SafetyCenter'},
    {ico:'👁️', t:'Guardian',     d:'Share live location',          c:C.plum,    bg:C.plumLight,  sc:'GuardianSetup'},
    {ico:'📄', t:'My Documents', d:'Upload CNIC & license',        c:C.muted,   bg:C.border,     sc:'Profile'},
  ];

  const BOTTOM_TABS = [
    {ico:'🏠', lbl:'Home',     fn:()=>setTab('home')},
    {ico:'📋', lbl:'Rides',    fn:()=>navigation.navigate('RideHistory')},
    {ico:'💰', lbl:'Earnings', fn:()=>navigation.navigate('Wallet')},
    {ico:'👤', lbl:'Profile',  fn:()=>navigation.navigate('Profile')},
  ];

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={GRAD.primary} style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greeting}>Assalam o Alaikum 🌸</Text>
              <Text style={styles.name}>{user?.name || 'Driver'}</Text>
              <Text style={styles.role}>🚗 Mehfooz Driver</Text>
            </View>
            <View style={styles.headerIcons}>
              <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.iconBtn}>
                <Text style={{fontSize:20}}>🔔</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.avatar}>
                <Text style={{fontSize:26}}>👩</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            {[
              {lbl:'Rating',  val: !stats ? '…' : stats.totalRatings ? `${Number(stats.averageRating).toFixed(1)} ⭐` : 'New'},
              {lbl:'Rides',   val: stats ? stats.totalRides : '…'},
              {lbl:'Today',   val: stats ? `Rs.${Math.round(stats.todayEarnings).toLocaleString()}` : '…'},
            ].map(s => (
              <View key={s.lbl} style={styles.statBox}>
                <Text style={styles.statVal}>{s.val}</Text>
                <Text style={styles.statLbl}>{s.lbl}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* Verification warning */}
        {!user?.isVerified && (
          <View style={styles.verifyBanner}>
            <Text style={styles.verifyText}>⚠️ Your account is pending verification. Upload documents to go online.</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
              <Text style={{color:C.rose, fontWeight:'700', fontSize:12}}>Upload →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Verification status — built from the checks the server has on record */}
        {verification && (
          <View style={styles.vCard}>
            <Text style={[styles.vTitle, {color: verification.verified ? C.success : '#B07030'}]}>
              {verification.verified ? '✅ ' : '⏳ '}{verification.label}{verification.isDemo ? '  ·  🧪 demo account' : ''}
            </Text>
            <View style={styles.vChecks}>
              {[['cnic','CNIC'],['documents','Documents'],['vehicle','Vehicle'],['backgroundCheck','Background check'],['adminApproved','Admin approval']].map(([k, lbl]) => (
                <Text key={k} style={[styles.vCheck, {color: verification.checks?.[k] ? C.success : C.muted}]}>
                  {verification.checks?.[k] ? '✓' : '○'} {lbl}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Online Toggle */}
        <TouchableOpacity onPress={user?.isVerified ? toggleOnline : ()=>Alert.alert('Not Verified','Please upload documents first.')}
          style={[styles.onlineCard, {borderColor: isOnline ? C.success : C.border}]}>
          <View style={[styles.onlineDot, {backgroundColor: isOnline ? C.success : C.muted}]} />
          <View style={{flex:1}}>
            <Text style={styles.onlineTitle}>{isOnline ? '🟢 You are Online' : '🔴 You are Offline'}</Text>
            <Text style={styles.onlineSub}>
              {!statusKnown ? 'Checking status…' : isOnline ? (gpsError || 'Receiving nearby ride requests · sharing your location') : 'Tap to go online and start earning'}
            </Text>
          </View>
          <View style={[styles.toggle, {backgroundColor: isOnline ? C.success : C.border}]}>
            <View style={[styles.toggleKnob, {alignSelf: isOnline ? 'flex-end' : 'flex-start'}]} />
          </View>
        </TouchableOpacity>

        {/* Feature Grid */}
        <View style={styles.grid}>
          {FEATURES.map(f => (
            <TouchableOpacity key={f.t} onPress={() => f.sc && navigation.navigate(f.sc)}
              style={[styles.featureCard, {backgroundColor:f.bg}]}>
              <Text style={{fontSize:26, marginBottom:6}}>{f.ico}</Text>
              <Text style={[styles.featureTitle, {color:f.c}]}>{f.t}</Text>
              <Text style={styles.featureDesc}>{f.d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{height:80}} />
      </ScrollView>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {BOTTOM_TABS.map(t => (
          <TouchableOpacity key={t.lbl} onPress={t.fn} style={styles.tabItem}>
            <Text style={{fontSize:22}}>{t.ico}</Text>
            <Text style={styles.tabLbl}>{t.lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:       {flex:1, backgroundColor:C.bg},
  header:       {padding:20, paddingTop:50, paddingBottom:24},
  headerRow:    {flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18},
  greeting:     {color:'rgba(255,255,255,0.75)', fontSize:13},
  name:         {color:'#fff', fontSize:20, fontWeight:'800', marginTop:2},
  role:         {color:'rgba(255,255,255,0.7)', fontSize:12, marginTop:2},
  headerIcons:  {flexDirection:'row', gap:10, alignItems:'center'},
  iconBtn:      {backgroundColor:'rgba(255,255,255,0.2)', borderRadius:20, width:38, height:38, alignItems:'center', justifyContent:'center'},
  avatar:       {backgroundColor:'rgba(255,255,255,0.25)', borderRadius:22, width:44, height:44, alignItems:'center', justifyContent:'center'},
  statsRow:     {flexDirection:'row', gap:10},
  statBox:      {flex:1, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:14, padding:10, alignItems:'center'},
  statVal:      {color:'#fff', fontSize:14, fontWeight:'800'},
  statLbl:      {color:'rgba(255,255,255,0.7)', fontSize:9, marginTop:2},
  verifyBanner: {backgroundColor:C.dangerBg, margin:14, borderRadius:14, padding:12, flexDirection:'row', alignItems:'center', gap:10, borderWidth:1, borderColor:`${C.danger}30`},
  verifyText:   {flex:1, fontSize:11, color:C.danger},
  vCard:        {backgroundColor:'#fff', marginHorizontal:14, marginTop:14, borderRadius:16, padding:12, borderWidth:1, borderColor:C.border},
  vTitle:       {fontSize:13, fontWeight:'800'},
  vChecks:      {flexDirection:'row', flexWrap:'wrap', gap:10, marginTop:6},
  vCheck:       {fontSize:11, fontWeight:'600'},
  onlineCard:   {backgroundColor:'#fff', margin:14, borderRadius:18, padding:16, flexDirection:'row', alignItems:'center', gap:14, borderWidth:2, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08, elevation:3},
  onlineDot:    {width:14, height:14, borderRadius:7},
  onlineTitle:  {fontSize:14, fontWeight:'700', color:C.text},
  onlineSub:    {fontSize:11, color:C.muted, marginTop:3},
  toggle:       {width:48, height:26, borderRadius:13, padding:2, justifyContent:'center'},
  toggleKnob:   {width:22, height:22, borderRadius:11, backgroundColor:'#fff'},
  grid:         {flexDirection:'row', flexWrap:'wrap', padding:14, gap:10},
  featureCard:  {width:'47%', borderRadius:18, padding:14},
  featureTitle: {fontSize:13, fontWeight:'700', marginBottom:3},
  featureDesc:  {fontSize:10, color:C.muted, lineHeight:14},
  tabBar:       {flexDirection:'row', backgroundColor:'#fff', borderTopWidth:1, borderTopColor:C.border, paddingBottom:8},
  tabItem:      {flex:1, alignItems:'center', paddingTop:10},
  tabLbl:       {fontSize:10, color:C.muted, marginTop:2},
});
