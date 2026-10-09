// src/screens/safety/FakeCallScreen.js
// REQ 18: Fake call with multiple callers + ringtone options + fake conversation

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, ScrollView, Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { C, GRAD } from '../../utils/theme';

const CALLERS = [
  { id: 'ammi',    name: 'Ammi',          emoji: '👩‍👧', relation: 'Mother'          },
  { id: 'baji',    name: 'Baji Sara',     emoji: '👧',  relation: 'Sister'           },
  { id: 'office',  name: 'Office',        emoji: '💼',  relation: 'Workplace'        },
  { id: 'unknown', name: 'Unknown Number',emoji: '📵',  relation: '+92 300 0000000'  },
  { id: 'friend',  name: 'Sana (Friend)', emoji: '👯‍♀️', relation: 'Friend'           },
];

const RINGTONES = [
  { id: 'default',   label: '🎵 Default Ring',   desc: 'Classic phone ring'     },
  { id: 'dholki',    label: '🥁 Dholki Tone',    desc: 'Festive Pakistani tone' },
  { id: 'soft',      label: '🎶 Soft Bell',       desc: 'Gentle incoming tone'   },
  { id: 'vibrate',   label: '📳 Vibrate Only',   desc: 'No sound, just vibrate' },
];

// Fake conversation scripts per caller
const SCRIPTS = {
  ammi:    ['Hello? Ayesha beti kahan ho?', 'Ghar kab aaogi?', 'Theek ho na? Mujhe fikr ho rahi thi.', 'Achi baat hai. Jaldi aa jaana.', 'Allah hafiz beti.'],
  baji:    ['Ayesha! Kya kar rahi ho?', 'Woh shopping mall wala kaam ho gaya?', 'Achha suno mujhe ek kaam tha...', 'Haan haan bilkul. Theek hai.', 'Ok bye!'],
  office:  ['Hello, Ms. Ayesha?', 'Aapki meeting 3 baje hai, yaad hai na?', 'Haan sir, main aa rahi hoon.', 'Theek hai, see you soon.', 'Okay, bye.'],
  unknown: ['Hello?', '...', 'Wrong number hai shayad.', 'Haan?', 'Ok.'],
  friend:  ['Yaar Ayesha!', 'Kahan ho tum? Main wait kar rahi hoon!', 'Haan yaar 10 minute mein pohanch jaoon gi.', 'Chal jaldi aao!', 'Haan aa rahi hoon!'],
};

export default function FakeCallScreen({ navigation }) {
  const [phase,           setPhase]          = useState('setup');   // setup | ringing | answered | ended
  const [selectedCaller,  setSelectedCaller]  = useState(CALLERS[0]);
  const [selectedRingtone,setSelectedRingtone]= useState(RINGTONES[0]);
  const [delay,           setDelay]           = useState(3);
  const [callSec,         setCallSec]         = useState(0);
  const [scriptIdx,       setScriptIdx]       = useState(0);
  const [showSetup,       setShowSetup]       = useState(false);

  const pulse    = useRef(new Animated.Value(1)).current;
  const callTimer= useRef(null);
  const delayRef = useRef(null);

  // Pulse ring animation
  useEffect(() => {
    if (phase === 'ringing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [phase]);

  // Call timer
  useEffect(() => {
    if (phase === 'answered') {
      callTimer.current = setInterval(() => {
        setCallSec(s => s + 1);
        setScriptIdx(i => Math.min(i + 1, SCRIPTS[selectedCaller.id].length - 1));
      }, 2500);
    }
    return () => clearInterval(callTimer.current);
  }, [phase]);

  const fmt = s => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const startCall = () => {
    setPhase('ringing');
    delayRef.current = setTimeout(() => {
      // Auto-answer after delay (simulates incoming)
    }, delay * 1000);
  };

  const answer = () => { setPhase('answered'); setCallSec(0); setScriptIdx(0); };

  const endCall = () => {
    clearTimeout(delayRef.current);
    clearInterval(callTimer.current);
    setPhase('ended');
    setTimeout(() => navigation.goBack(), 1500);
  };

  // ── SETUP SCREEN ──────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={GRAD.primary} style={styles.setupHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.setupTitle}>🤙 Fake Call</Text>
          <Text style={styles.setupSub}>Set up your fake call to feel safe</Text>
        </LinearGradient>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>

          {/* Choose Caller */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>👤 Choose Caller</Text>
            {CALLERS.map(caller => (
              <TouchableOpacity key={caller.id} onPress={() => setSelectedCaller(caller)}
                style={[styles.optionRow, selectedCaller.id === caller.id && styles.optionActive]}>
                <Text style={{ fontSize: 24 }}>{caller.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, selectedCaller.id === caller.id && { color: C.rose }]}>{caller.name}</Text>
                  <Text style={styles.optionSub}>{caller.relation}</Text>
                </View>
                {selectedCaller.id === caller.id && (
                  <View style={styles.checkDot}><Text style={{ color: '#fff', fontSize: 11 }}>✓</Text></View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Choose Ringtone */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🎵 Choose Ringtone</Text>
            {RINGTONES.map(rt => (
              <TouchableOpacity key={rt.id} onPress={() => setSelectedRingtone(rt)}
                style={[styles.optionRow, selectedRingtone.id === rt.id && styles.optionActive]}>
                <Text style={{ fontSize: 20 }}>{rt.label.split(' ')[0]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, selectedRingtone.id === rt.id && { color: C.rose }]}>{rt.label}</Text>
                  <Text style={styles.optionSub}>{rt.desc}</Text>
                </View>
                {selectedRingtone.id === rt.id && (
                  <View style={styles.checkDot}><Text style={{ color: '#fff', fontSize: 11 }}>✓</Text></View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Delay Timer */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>⏱️ Call Arrives In</Text>
            <View style={styles.delayRow}>
              {[3, 5, 10, 15].map(d => (
                <TouchableOpacity key={d} onPress={() => setDelay(d)}
                  style={[styles.delayBtn, delay === d && styles.delayBtnActive]}>
                  <Text style={[styles.delayText, delay === d && { color: '#fff' }]}>{d}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Preview */}
          <View style={[styles.sectionCard, { backgroundColor: C.rosePale, borderColor: C.rose }]}>
            <Text style={styles.sectionTitle}>📋 Call Preview</Text>
            <Text style={{ fontSize: 13, color: C.text }}>
              {selectedCaller.emoji} <Text style={{ fontWeight: '800' }}>{selectedCaller.name}</Text> will call in <Text style={{ fontWeight: '800', color: C.rose }}>{delay} seconds</Text>
            </Text>
            <Text style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Ringtone: {selectedRingtone.label}
            </Text>
          </View>

          <TouchableOpacity onPress={startCall} style={styles.startBtn}>
            <LinearGradient colors={GRAD.primary} style={styles.startBtnInner}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>🤙 Start Fake Call</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
    );
  }

  // ── RINGING SCREEN ────────────────────────────────────────────────────────
  if (phase === 'ringing') {
    return (
      <View style={styles.callScreen}>
        <Text style={styles.callStatus}>INCOMING CALL</Text>
        <Text style={styles.callRingtone}>{selectedRingtone.label}</Text>

        <Animated.View style={[styles.avatarWrap, { transform: [{ scale: pulse }] }]}>
          <View style={styles.ring1} />
          <View style={styles.ring2} />
          <View style={styles.avatar}>
            <Text style={{ fontSize: 60 }}>{selectedCaller.emoji}</Text>
          </View>
        </Animated.View>

        <Text style={styles.callerName}>{selectedCaller.name}</Text>
        <Text style={styles.callerRelation}>{selectedCaller.relation}</Text>

        <View style={styles.callBtns}>
          <TouchableOpacity onPress={endCall} style={[styles.callBtn, { backgroundColor: '#E74C3C' }]}>
            <Text style={{ fontSize: 28 }}>📵</Text>
            <Text style={styles.callBtnLabel}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={answer} style={[styles.callBtn, { backgroundColor: '#27AE60' }]}>
            <Text style={{ fontSize: 28 }}>📞</Text>
            <Text style={styles.callBtnLabel}>Answer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── ANSWERED / IN CALL SCREEN ─────────────────────────────────────────────
  if (phase === 'answered') {
    const script = SCRIPTS[selectedCaller.id] || SCRIPTS.ammi;
    return (
      <View style={styles.callScreen}>
        <Text style={styles.callStatus}>ON CALL</Text>
        <Text style={styles.callTimer}>{fmt(callSec)}</Text>

        <View style={styles.avatar}>
          <Text style={{ fontSize: 60 }}>{selectedCaller.emoji}</Text>
        </View>
        <Text style={styles.callerName}>{selectedCaller.name}</Text>
        <Text style={styles.callerRelation}>{selectedCaller.relation}</Text>

        {/* Fake conversation bubble */}
        <View style={styles.speechBubble}>
          <Text style={styles.speechText}>"{script[scriptIdx]}"</Text>
        </View>

        {/* Mute / Speaker buttons (visual only) */}
        <View style={styles.callActions}>
          {[
            { ico: '🔇', label: 'Mute'    },
            { ico: '🔊', label: 'Speaker' },
            { ico: '⌨️', label: 'Keypad'  },
          ].map(a => (
            <TouchableOpacity key={a.label} style={styles.callAction}>
              <Text style={{ fontSize: 26 }}>{a.ico}</Text>
              <Text style={styles.callActionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={endCall} style={styles.endBtn}>
          <Text style={{ fontSize: 28 }}>📵</Text>
          <Text style={styles.callBtnLabel}>End Call</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── ENDED ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.callScreen}>
      <Text style={styles.callStatus}>CALL ENDED</Text>
      <View style={styles.avatar}><Text style={{ fontSize: 60 }}>{selectedCaller.emoji}</Text></View>
      <Text style={styles.callerName}>{selectedCaller.name}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>Duration: {fmt(callSec)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: C.bg },
  setupHeader:      { padding: 24, paddingTop: 50, paddingBottom: 30 },
  backBtn:          { marginBottom: 10 },
  setupTitle:       { color: '#fff', fontSize: 22, fontWeight: '800' },
  setupSub:         { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  sectionCard:      { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border },
  sectionTitle:     { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 12 },
  optionRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent', marginBottom: 8 },
  optionActive:     { borderColor: C.rose, backgroundColor: C.rosePale },
  optionLabel:      { fontSize: 13, fontWeight: '700', color: C.text },
  optionSub:        { fontSize: 11, color: C.muted, marginTop: 2 },
  checkDot:         { width: 22, height: 22, borderRadius: 11, backgroundColor: C.rose, alignItems: 'center', justifyContent: 'center' },
  delayRow:         { flexDirection: 'row', gap: 10 },
  delayBtn:         { flex: 1, borderRadius: 12, borderWidth: 2, borderColor: C.border, padding: 12, alignItems: 'center', backgroundColor: '#fff' },
  delayBtnActive:   { backgroundColor: C.rose, borderColor: C.rose },
  delayText:        { fontWeight: '800', color: C.text, fontSize: 14 },
  startBtn:         { borderRadius: 18, overflow: 'hidden' },
  startBtnInner:    { padding: 18, alignItems: 'center' },
  // Call screen
  callScreen:       { flex: 1, backgroundColor: '#1A0A28', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 60, paddingHorizontal: 30 },
  callStatus:       { color: 'rgba(255,255,255,0.6)', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  callRingtone:     { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 },
  callTimer:        { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  avatarWrap:       { position: 'relative', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  ring1:            { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },
  ring2:            { position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  avatar:           { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  callerName:       { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 16 },
  callerRelation:   { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 },
  callBtns:         { flexDirection: 'row', gap: 40, marginTop: 20 },
  callBtn:          { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', gap: 4 },
  callBtnLabel:     { color: '#fff', fontSize: 11, fontWeight: '600' },
  speechBubble:     { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 18, padding: 16, marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', maxWidth: '90%' },
  speechText:       { color: '#fff', fontSize: 15, fontStyle: 'italic', textAlign: 'center', lineHeight: 22 },
  callActions:      { flexDirection: 'row', gap: 30, marginTop: 20 },
  callAction:       { alignItems: 'center', gap: 6 },
  callActionLabel:  { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  endBtn:           { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
});
