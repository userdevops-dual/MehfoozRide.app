// src/screens/passenger/FindingDriverScreen.js
import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, Animated, Alert} from 'react-native';
import {onDriverFound, offEvent} from '../../services/socket';
import {PrimaryBtn} from '../../components/UI';
import {C, GRAD} from '../../utils/theme';
import LinearGradient from 'react-native-linear-gradient';

export default function FindingDriverScreen({navigation, route}) {
  const {ride} = route.params;
  const [progress, setProgress] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate progress bar
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(interval); return 100; }
        return p + 2;
      });
    }, 80);

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {toValue:1, duration:900, useNativeDriver:true}),
        Animated.timing(anim, {toValue:0, duration:900, useNativeDriver:true}),
      ])
    ).start();

    // Listen for driver found event from socket
    onDriverFound((data) => {
      clearInterval(interval);
      navigation.replace('DriverFound', {ride, driver: data.driver});
    });

    // Simulate finding driver after 5 seconds (for demo without full socket setup)
    const demo = setTimeout(() => {
      navigation.replace('DriverFound', {
        ride,
        driver: {
          name:'Fatima Malik', phone:'+923009876543', rating:4.9,
          vehicle:'Toyota Corolla', vehicleColor:'White', licensePlate:'ABC-1234',
        },
      });
    }, 5000);

    return () => { clearInterval(interval); clearTimeout(demo); offEvent('ride:driver-found'); };
  }, []);

  const scale = anim.interpolate({inputRange:[0,1], outputRange:[1, 1.08]});

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
      <Text style={styles.progressText}>{progress}% matched</Text>

      <View style={styles.tags}>
        {['✅ ID Verified','⭐ 4.8+ Rating','🛡️ Safety Checked','📍 2km Away'].map(t=>(
          <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
        ))}
      </View>
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
});
