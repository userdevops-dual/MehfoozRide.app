// src/screens/passenger/FindingDriverScreen.js
import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, Animated, Alert, TouchableOpacity} from 'react-native';
import {onDriverFound, offEvent} from '../../services/socket';
import {rideAPI} from '../../services/api';
import {C, GRAD} from '../../utils/theme';
import LinearGradient from 'react-native-linear-gradient';

// If no driver accepts within this time, the ride is cancelled on the server
const SEARCH_TIMEOUT_SECONDS = 120;

export default function FindingDriverScreen({navigation, route}) {
  const {ride} = route.params;
  const [elapsed, setElapsed] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const done = useRef(false);

  const cancelSearch = async (reason) => {
    if (done.current) return;
    done.current = true;
    try { await rideAPI.cancel(ride._id, reason); } catch (_) {}
  };

  useEffect(() => {
    const interval = setInterval(() => setElapsed(s => s + 1), 1000);

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {toValue:1, duration:900, useNativeDriver:true}),
        Animated.timing(anim, {toValue:0, duration:900, useNativeDriver:true}),
      ])
    ).start();

    // Real driver accepted the ride (sent by the server after a successful accept)
    onDriverFound((data) => {
      if (data?.rideId?.toString() !== ride._id?.toString() || done.current) return;
      done.current = true;
      navigation.replace('DriverFound', {ride, driver: data.driver});
    });

    // No driver in time — cancel instead of showing a made-up driver
    const timeout = setTimeout(async () => {
      if (done.current) return;
      await cancelSearch('No driver available');
      Alert.alert('No Drivers Available', 'No verified driver accepted your ride. Please try again in a few minutes.', [
        {text: 'OK', onPress: () => navigation.replace('PassengerHome')},
      ]);
    }, SEARCH_TIMEOUT_SECONDS * 1000);

    return () => { clearInterval(interval); clearTimeout(timeout); offEvent('ride:driver-found'); };
  }, []);

  const onCancelPress = () => {
    Alert.alert('Cancel Ride?', 'Stop searching for a driver?', [
      {text: 'Keep Searching', style: 'cancel'},
      {text: 'Cancel Ride', style: 'destructive', onPress: async () => {
        await cancelSearch('Cancelled by passenger while searching');
        navigation.replace('PassengerHome');
      }},
    ]);
  };

  const scale = anim.interpolate({inputRange:[0,1], outputRange:[1, 1.08]});
  const progress = Math.min(100, Math.round((elapsed / SEARCH_TIMEOUT_SECONDS) * 100));

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
          <Text style={{fontSize:52}}>🚗</Text>
        </View>
      </View>

      <Text style={styles.title}>Finding Your Safe Driver</Text>
      <Text style={styles.subtitle}>Searching verified female drivers{'\n'}near you in Lahore...</Text>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, {width:`${progress}%`}]} />
      </View>
      <Text style={styles.progressText}>Searching… {elapsed}s</Text>

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
});
