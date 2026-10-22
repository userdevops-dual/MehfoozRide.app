// src/screens/passenger/FindingDriverScreen.js
// Waiting for a driver. The server offers the request to nearby drivers, expires
// it if nobody accepts in time, and tells this screen about pool matches.
import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, Animated, Alert, TouchableOpacity} from 'react-native';
import {onDriverFound, onPoolUpdated, onRideExpired} from '../../services/socket';
import {rideAPI} from '../../services/api';
import {C, GRAD} from '../../utils/theme';
import LinearGradient from 'react-native-linear-gradient';

const FALLBACK_TIMEOUT_SECONDS = 120;

export default function FindingDriverScreen({navigation, route}) {
  const {ride: bookedRide, pool: bookedPool, driversNotified} = route.params;
  const [ride, setRide] = useState(bookedRide);
  const [pool, setPool] = useState(bookedPool || null);   // { passengers, yourFare, soloFare }
  const [now, setNow]   = useState(Date.now());
  const anim = useRef(new Animated.Value(0)).current;
  const done = useRef(false);

  const startedAt = useRef(Date.now()).current;
  const expiresAt = ride.requestExpiresAt ? new Date(ride.requestExpiresAt).getTime() : startedAt + FALLBACK_TIMEOUT_SECONDS * 1000;
  const total     = Math.max(1, expiresAt - startedAt);
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  const finish = (fn) => { if (done.current) return; done.current = true; fn(); };

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);

    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {toValue:1, duration:900, useNativeDriver:true}),
        Animated.timing(anim, {toValue:0, duration:900, useNativeDriver:true}),
      ])
    ).start();

    const subs = [
      // A driver accepted (sent by the server)
      onDriverFound((data) => {
        if (String(data?.rideId) !== String(ride._id)) return;
        finish(() => navigation.replace('DriverFound', {
          ride: { ...ride, ...(data.pool ? { farePerPassenger: data.pool.yourFare, poolPassengers: data.pool.passengers } : {}) },
          driver: data.driver,
        }));
      }),
      // Another passenger joined (or left) the pool
      onPoolUpdated((data) => {
        if (String(data?.rideId) !== String(ride._id)) return;
        setPool(data.pooled ? { passengers: data.passengers, yourFare: data.yourFare, soloFare: data.soloFare } : null);
        setRide(r => ({ ...r, farePerPassenger: data.yourFare }));
      }),
      // Nobody accepted in time — the server cancelled the request
      onRideExpired((data) => {
        if (String(data?.rideId) !== String(ride._id)) return;
        finish(() => Alert.alert('No Drivers Available', data.message || 'No driver accepted your ride. Please try again in a few minutes.', [
          {text: 'OK', onPress: () => navigation.replace('PassengerHome')},
        ]));
      }),
    ];

    // Safety net if the expiry message is missed (e.g. connection dropped):
    // ask the server what happened to the ride.
    const check = setTimeout(async () => {
      if (done.current) return;
      try {
        const res = await rideAPI.getById(ride._id);
        const status = res.ride?.status;
        if (status === 'requested') return;
        if (status === 'cancelled') {
          finish(() => Alert.alert('Ride Not Matched', 'No driver accepted your ride in time. Please try again.', [
            {text: 'OK', onPress: () => navigation.replace('PassengerHome')},
          ]));
        } else if (res.ride?.driver) {
          finish(() => navigation.replace('DriverFound', { ride: { ...ride, ...res.ride, otp: ride.otp }, driver: res.ride.driver }));
        }
      } catch {}
    }, Math.max(0, expiresAt - Date.now()) + 15000);

    return () => { clearInterval(interval); clearTimeout(check); subs.forEach(off => off && off()); };
  }, []);

  const onCancelPress = () => {
    Alert.alert('Cancel Ride?', 'Stop searching for a driver?', [
      {text: 'Keep Searching', style: 'cancel'},
      {text: 'Cancel Ride', style: 'destructive', onPress: async () => {
        try { await rideAPI.cancel(ride._id, 'Cancelled by passenger while searching'); } catch {}
        finish(() => navigation.replace('PassengerHome'));
      }},
    ]);
  };

  const scale = anim.interpolate({inputRange:[0,1], outputRange:[1, 1.08]});
  const progress = Math.min(100, Math.round(((now - startedAt) / total) * 100));

  return (
    <LinearGradient colors={GRAD.primary} style={styles.screen}>
      <View style={styles.pulseWrap}>
        {[0,1,2].map(i => (
          <Animated.View key={i} style={[
            styles.ring,
            {transform:[{scale}], opacity: (3-i)*0.18,
             position:'absolute', inset: -i*28}
          ]} />
        ))}
        <View style={styles.carCircle}>
          <Text style={{fontSize:52}}>{pool ? '👯‍♀️' : '🚗'}</Text>
        </View>
      </View>

      <Text style={styles.title}>Finding Your Safe Driver</Text>
      <Text style={styles.subtitle}>
        {driversNotified > 0
          ? `Request sent to ${driversNotified} verified female driver${driversNotified > 1 ? 's' : ''} nearby…`
          : 'No drivers are free nearby right now.\nWe will keep offering your ride as drivers come online.'}
      </Text>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, {width:`${progress}%`}]} />
      </View>
      <Text style={styles.progressText}>Waiting for a driver… {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} left</Text>

      {pool ? (
        <View style={styles.poolCard}>
          <Text style={styles.poolTitle}>👯‍♀️ Pool matched — {pool.passengers} passengers</Text>
          <Text style={styles.poolText}>Your fare is now about Rs {pool.yourFare} (instead of Rs {pool.soloFare}).</Text>
        </View>
      ) : ride.isPooled ? (
        <View style={styles.poolCard}>
          <Text style={styles.poolText}>Pooling is on — we'll match you if a verified passenger is going your way. Otherwise you pay the normal fare.</Text>
        </View>
      ) : null}

      <View style={styles.tags}>
        {['✅ ID Verified','🛡️ Safety Checked','♀ Female Drivers Only'].map(t=>(
          <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
        ))}
      </View>

      <TouchableOpacity onPress={onCancelPress} style={styles.cancelBtn}>
        <Text style={styles.cancelText}>Cancel Ride</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen:      {flex:1, alignItems:'center', justifyContent:'center', padding:32},
  pulseWrap:   {width:148, height:148, marginBottom:32, alignItems:'center', justifyContent:'center'},
  ring:        {width:148, height:148, borderRadius:74, borderWidth:2.5, borderColor:'rgba(255,255,255,0.4)', position:'absolute'},
  carCircle:   {width:148, height:148, borderRadius:74, backgroundColor:'rgba(255,255,255,0.2)',
                 alignItems:'center', justifyContent:'center'},
  title:       {color:'#fff', fontSize:22, fontWeight:'800', marginBottom:8, textAlign:'center'},
  subtitle:    {color:'rgba(255,255,255,0.8)', fontSize:14, marginBottom:28, textAlign:'center', lineHeight:22},
  progressBar: {width:'100%', height:10, backgroundColor:'rgba(255,255,255,0.25)', borderRadius:5, overflow:'hidden', marginBottom:10},
  progressFill:{height:'100%', backgroundColor:'white', borderRadius:5},
  progressText:{color:'#fff', fontWeight:'700', fontSize:14, marginBottom:28},
  tags:        {flexDirection:'row', flexWrap:'wrap', gap:8, justifyContent:'center'},
  tag:         {paddingHorizontal:14, paddingVertical:7, borderRadius:20, backgroundColor:'rgba(255,255,255,0.2)'},
  tagText:     {color:'#fff', fontSize:11, fontWeight:'700'},
  cancelBtn:   {marginTop:32, paddingHorizontal:28, paddingVertical:12, borderRadius:24, borderWidth:1.5, borderColor:'rgba(255,255,255,0.7)'},
  cancelText:  {color:'#fff', fontWeight:'700', fontSize:14},
  poolCard:    {backgroundColor:'rgba(255,255,255,0.18)', borderRadius:16, padding:14, marginBottom:20, width:'100%'},
  poolTitle:   {color:'#fff', fontWeight:'800', fontSize:14, marginBottom:4},
  poolText:    {color:'rgba(255,255,255,0.92)', fontSize:12, lineHeight:18},
});
