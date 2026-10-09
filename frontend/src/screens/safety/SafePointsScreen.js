// ─── SafePointsScreen ───────────────────────────────────────────────────────
// src/screens/shared/SafePointsScreen.js
import React, {useState} from 'react';
import {View, Text, TouchableOpacity, ScrollView, StyleSheet} from 'react-native';
import {C} from '../../utils/theme';

const POINTS = [
  {id:1, type:'hospital', ico:'🏥', name:'CMH Lahore',             dist:'0.8 km', addr:'Jail Road, Lahore',        open:'24/7',       c:'#CC2222', bg:'#FFEBEE'},
  {id:2, type:'police',   ico:'👮', name:'Model Town Police Stn',  dist:'1.2 km', addr:'Model Town Link Road',      open:'24/7',       c:C.info,    bg:C.infoBg},
  {id:3, type:'safe',     ico:'🏪', name:'Packages Mall',          dist:'0.5 km', addr:'Walton Road, Lahore',       open:'10am-10pm',  c:C.success, bg:C.successBg},
  {id:4, type:'hospital', ico:'🏥', name:'Services Hospital',       dist:'2.1 km', addr:'Jail Road, Lahore',        open:'24/7',       c:'#CC2222', bg:'#FFEBEE'},
  {id:5, type:'police',   ico:'👮', name:'Gulberg Police Station',  dist:'1.8 km', addr:'Main Boulevard Gulberg',   open:'24/7',       c:C.info,    bg:C.infoBg},
  {id:6, type:'safe',     ico:'☕', name:"Gloria Jean's Coffee",   dist:'0.3 km', addr:'MM Alam Road',             open:'8am-11pm',   c:C.gold,    bg:C.goldLight},
];

export default function SafePointsScreen({navigation}) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? POINTS : POINTS.filter(p => p.type === filter);

  return (
    <View style={{flex:1, backgroundColor:C.bg}}>
      {/* Header */}
      <View style={s.hdr}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><Text style={{fontSize:18, color:C.rose}}>←</Text></TouchableOpacity>
        <Text style={s.hdrTitle}>Safe Points 📍</Text>
      </View>
      {/* Map */}
      <View style={s.map}><Text style={{fontSize:36}}>🗺️</Text><Text style={{color:C.muted, fontSize:11, marginTop:6}}>Safe locations on map</Text></View>
      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexShrink:0, padding:12, paddingBottom:6}}>
        {[{id:'all',lbl:'All'},{id:'hospital',lbl:'🏥 Hospitals'},{id:'police',lbl:'👮 Police'},{id:'safe',lbl:'🏪 Safe Places'}].map(f=>(
          <TouchableOpacity key={f.id} onPress={() => setFilter(f.id)}
            style={[s.filter, filter===f.id && s.filterActive]}>
            <Text style={[s.filterTxt, filter===f.id && {color:C.rose}]}>{f.lbl}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{padding:12, gap:10}}>
        {filtered.map(p => (
          <View key={p.id} style={s.pointCard}>
            <View style={[s.pointIcon, {backgroundColor:p.bg}]}><Text style={{fontSize:24}}>{p.ico}</Text></View>
            <View style={{flex:1}}>
              <Text style={s.pointName}>{p.name}</Text>
              <Text style={s.pointAddr}>{p.addr}</Text>
              <View style={{flexDirection:'row', gap:8, marginTop:5}}>
                <View style={[s.tag, {backgroundColor:p.bg}]}><Text style={[s.tagTxt, {color:p.c}]}>{p.dist}</Text></View>
                <View style={[s.tag, {backgroundColor:C.bg}]}><Text style={[s.tagTxt, {color:C.muted}]}>⏰ {p.open}</Text></View>
              </View>
            </View>
            <TouchableOpacity style={[s.goBtn, {backgroundColor:p.bg}]}><Text style={[{fontWeight:'700', fontSize:12}, {color:p.c}]}>Go →</Text></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  hdr:       {backgroundColor:C.white, flexDirection:'row', alignItems:'center', gap:12, padding:16, borderBottomWidth:1, borderBottomColor:C.border},
  back:      {backgroundColor:C.rosePale, borderRadius:12, width:38, height:38, alignItems:'center', justifyContent:'center'},
  hdrTitle:  {fontSize:16, fontWeight:'800', color:C.text},
  map:       {height:150, backgroundColor:'#FBF0F7', alignItems:'center', justifyContent:'center'},
  filter:    {paddingHorizontal:14, paddingVertical:7, borderRadius:20, borderWidth:1.5, borderColor:C.border, backgroundColor:C.white, marginRight:8},
  filterActive:{borderColor:C.rose, backgroundColor:C.rosePale},
  filterTxt: {fontSize:12, fontWeight:'600', color:C.muted},
  pointCard: {backgroundColor:C.white, borderRadius:18, padding:14, flexDirection:'row', gap:12, alignItems:'center', borderWidth:1, borderColor:C.border},
  pointIcon: {width:48, height:48, borderRadius:24, alignItems:'center', justifyContent:'center'},
  pointName: {fontSize:13, fontWeight:'700', color:C.text},
  pointAddr: {fontSize:11, color:C.muted, marginTop:2},
  tag:       {paddingHorizontal:8, paddingVertical:2, borderRadius:10},
  tagTxt:    {fontSize:10, fontWeight:'700'},
  goBtn:     {padding:10, borderRadius:12},
});
