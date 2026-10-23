// src/screens/shared/SafetyCenterScreen.js
import React from 'react';
import {View, Text, TouchableOpacity, ScrollView, StyleSheet} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {C, GRAD} from '../../utils/theme';

export default function SafetyCenterScreen({navigation}) {
  const features = [
    {ico:'🤙', t:'Fake Call',   d:'Realistic incoming call screen', c:C.rose, bg:C.rosePale,   sc:'FakeCall'},
    {ico:'👁️', t:'Guardian',   d:'Share live location with family', c:C.plum, bg:C.plumLight,  sc:'GuardianSetup'},
    {ico:'📍', t:'Safe Points', d:'Hospitals & police nearby',       c:C.info, bg:C.infoBg,     sc:'SafePoints'},
    {ico:'🔐', t:'OTP Rides',   d:'Verify driver before every ride', c:C.success, bg:C.successBg, sc:null},
    {ico:'🚺', t:'Women Only',  d:'Only female drivers matched',      c:'#B07030', bg:C.goldLight, sc:null},
    {ico:'⭐', t:'Ratings',     d:'Rate every ride after it ends', c:C.roseDark||'#8B1A4A', bg:C.rosePale, sc:'Profile'},
  ];
  const tips = [
    'Always verify OTP before ride starts',
    'Share ride details with a trusted contact',
    'Trust your instincts — exit if uncomfortable',
    'Keep your phone charged before travelling',
    'Check driver photo matches the person',
  ];
  return (
    <ScrollView style={styles.screen}>
      <LinearGradient colors={GRAD.primary} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{color:'#fff', fontSize:13, fontWeight:'600'}}>← Back</Text>
        </TouchableOpacity>
        <Text style={{color:'white', fontSize:22, fontWeight:'800'}}>Safety Center 🛡️</Text>
        <Text style={{color:'rgba(255,255,255,0.75)', fontSize:12, marginTop:6, lineHeight:18}}>All safety tools in one place.{'\n'}We've got your back, always 💪</Text>
      </LinearGradient>

      <TouchableOpacity onPress={() => navigation.navigate('SOSScreen')} style={styles.sosBtn}>
        <LinearGradient colors={GRAD.danger} style={styles.sosBtnInner}>
          <View style={styles.sosIcon}><Text style={{fontSize:32}}>🆘</Text></View>
          <View style={{flex:1}}>
            <Text style={{color:'white', fontSize:18, fontWeight:'800'}}>SOS Emergency</Text>
            <Text style={{color:'rgba(255,255,255,0.8)', fontSize:12, marginTop:4, lineHeight:18}}>Starts an emergency session with your live location and opens the dialer for Police 15</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      <View style={styles.grid}>
        {features.map(f => (
          <TouchableOpacity key={f.t} onPress={() => f.sc && navigation.navigate(f.sc)}
            style={[styles.featureCard, {backgroundColor:f.bg}]}>
            <Text style={{fontSize:28, marginBottom:8}}>{f.ico}</Text>
            <Text style={[styles.featureTitle, {color:f.c}]}>{f.t}</Text>
            <Text style={styles.featureDesc}>{f.d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>💡 Safety Tips</Text>
        {tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <View style={styles.tipNum}><Text style={{color:C.rose, fontSize:11, fontWeight:'700'}}>{i+1}</Text></View>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen:       {flex:1, backgroundColor:C.bg},
  header:       {padding:24, paddingBottom:32},
  backBtn:      {backgroundColor:'rgba(255,255,255,0.2)', borderWidth:1, borderColor:'rgba(255,255,255,0.3)', paddingHorizontal:14, paddingVertical:6, borderRadius:20, alignSelf:'flex-start', marginBottom:12},
  sosBtn:       {margin:14, borderRadius:22, overflow:'hidden'},
  sosBtnInner:  {flexDirection:'row', alignItems:'center', gap:16, padding:20},
  sosIcon:      {width:64, height:64, borderRadius:32, backgroundColor:'rgba(255,255,255,0.2)', alignItems:'center', justifyContent:'center'},
  grid:         {flexDirection:'row', flexWrap:'wrap', gap:10, paddingHorizontal:14},
  featureCard:  {width:'47%', padding:14, borderRadius:18},
  featureTitle: {fontSize:12, fontWeight:'700', marginBottom:4},
  featureDesc:  {fontSize:10, color:C.muted, lineHeight:14},
  tipsCard:     {backgroundColor:C.white, borderRadius:20, padding:16, margin:14},
  tipsTitle:    {fontSize:13, fontWeight:'700', color:C.text, marginBottom:12},
  tipRow:       {flexDirection:'row', gap:10, alignItems:'flex-start', marginBottom:10},
  tipNum:       {width:22, height:22, borderRadius:11, backgroundColor:C.rosePale, alignItems:'center', justifyContent:'center'},
  tipText:      {flex:1, fontSize:12, color:C.text, lineHeight:18},
});
