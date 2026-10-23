// src/screens/safety/FakeCallScreen.js
// Fake incoming call: real ringtone + vibration, incoming-call screen, and a
// scripted conversation. The caller's lines are SPOKEN with the phone's own
// text-to-speech (works offline when the voice is installed) and shown as
// subtitles in sync; the passenger's replies are shown for her to say.
// Nobody is called. Callers/scripts/ringtones: src/config/fakeCall.js

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView, Vibration } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { CALLERS, RINGTONES, replyPauseMs } from '../../config/fakeCall';
import { C, GRAD } from '../../utils/theme';

const RING_VIBRATION = [0, 900, 700, 900, 1600];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Best available voice: Pakistani/Indian English first, then any English
const pickVoice = async () => {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (!voices?.length) return { available: false };
    // On-device voices first — "network" voices need internet and start slowly
    const local = voices.filter(x => !/network/i.test(x.identifier || ''));
    const pool = local.length ? local : voices;
    const by = (pred) => pool.find(pred);
    const v = by(x => /en[-_]PK/i.test(x.language)) || by(x => /en[-_]IN/i.test(x.language))
           || by(x => /^en/i.test(x.language) && x.quality === 'Enhanced') || by(x => /^en/i.test(x.language)) || pool[0];
    return { available: true, voice: v };
  } catch {
    return { available: true, voice: null };   // let the engine use its default
  }
};

export default function FakeCallScreen({ navigation }) {
  const [phase,    setPhase]    = useState('setup');   // setup | waiting | ringing | answered | ended
  const [caller,   setCaller]   = useState(CALLERS[0]);
  const [ringtone, setRingtone] = useState(RINGTONES[0]);
  const [delay,    setDelay]    = useState(5);
  const [waitLeft, setWaitLeft] = useState(0);
  const [callSec,  setCallSec]  = useState(0);
  const [lineIdx,  setLineIdx]  = useState(-1);
  const [muted,    setMuted]    = useState(false);
  const [tts,      setTts]      = useState({ available: true, voice: null });

  const pulse     = useRef(new Animated.Value(1)).current;
  const player    = useRef(null);
  const runId     = useRef(0);        // cancels a running script
  const mutedRef  = useRef(false);
  mutedRef.current = muted;
  const scrollRef = useRef(null);

  useEffect(() => {
    pickVoice().then(setTts);
    // Ring even when the phone is on silent, like a real call would on most setups
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
    return () => { stopRinging(); runId.current++; Speech.stop(); };
  }, []);

  // ── Ringing ───────────────────────────────────────────────────────────────
  const startRinging = () => {
    Vibration.vibrate(RING_VIBRATION, true);
    if (ringtone.source) {
      try {
        player.current = createAudioPlayer(ringtone.source);
        player.current.loop = true;
        player.current.volume = 1;
        player.current.play();
      } catch (e) { player.current = null; }
    }
  };
  const stopRinging = () => {
    Vibration.cancel();
    try { player.current?.pause(); player.current?.remove(); } catch {}
    player.current = null;
  };

  useEffect(() => {
    if (phase !== 'ringing') { pulse.setValue(1); return; }
    startRinging();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    // Unanswered calls stop ringing after 45 s, like a real phone
    const giveUp = setTimeout(() => endCall(), 45000);
    return () => { loop.stop(); stopRinging(); clearTimeout(giveUp); };
  }, [phase]);

  // ── Delay before the call arrives ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'waiting') return;
    if (waitLeft <= 0) { setPhase('ringing'); return; }
    const t = setTimeout(() => setWaitLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, waitLeft]);

  // ── Call timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'answered') return;
    const t = setInterval(() => setCallSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Speak one line and resolve when speech finishes (or a fallback time passes)
  const speak = (text, myRun) => new Promise(resolve => {
    const words = text.split(/\s+/).length;
    const fallback = setTimeout(resolve, words * 600 + 2500);   // in case the engine never calls back
    const done = () => { clearTimeout(fallback); resolve(); };
    if (mutedRef.current || !tts.available || myRun !== runId.current) { clearTimeout(fallback); setTimeout(resolve, words * 420 + 900); return; }
    Speech.speak(text, {
      language: tts.voice?.language, voice: tts.voice?.identifier,
      pitch: caller.voice?.pitch ?? 1, rate: caller.voice?.rate ?? 0.95,
      onDone: done, onStopped: done, onError: done,
    });
  });

  // ── The conversation: subtitles follow the audio ──────────────────────────
  const runScript = async () => {
    const myRun = ++runId.current;
    await sleep(900);                       // the "hello" pause after picking up
    for (let i = 0; i < caller.script.length; i++) {
      if (myRun !== runId.current) return;
      setLineIdx(i);
      const line = caller.script[i];
      if (line.who === 'caller') await speak(line.text, myRun);
      else await sleep(replyPauseMs(line.text));
      await sleep(350);
    }
  };

  const startCall = () => { setWaitLeft(delay); setPhase(delay > 0 ? 'waiting' : 'ringing'); };
  const answer = () => {
    stopRinging();
    setPhase('answered'); setCallSec(0); setLineIdx(-1);
    runScript();
  };
  const toggleMute = () => {
    setMuted(m => { if (!m) Speech.stop(); return !m; });
  };
  const endCall = () => {
    runId.current++;
    Speech.stop();
    stopRinging();
    setPhase('ended');
    setTimeout(() => navigation.goBack(), 1500);
  };

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={GRAD.primary} style={styles.setupHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.setupTitle}>🤙 Fake Call</Text>
          <Text style={styles.setupSub}>A pretend family call with real ringing and a spoken conversation. Nobody is actually called.</Text>
        </LinearGradient>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>👤 Who calls</Text>
            {CALLERS.map(c => (
              <TouchableOpacity key={c.id} onPress={() => setCaller(c)}
                style={[styles.optionRow, caller.id === c.id && styles.optionActive]}>
                <Text style={{ fontSize: 24 }}>{c.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, caller.id === c.id && { color: C.rose }]}>{c.name}</Text>
                  <Text style={styles.optionSub}>{c.relation} · “{c.script[0].text}”</Text>
                </View>
                {caller.id === c.id && <View style={styles.checkDot}><Text style={{ color: '#fff', fontSize: 11 }}>✓</Text></View>}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🎵 Ringtone</Text>
            {RINGTONES.map(rt => (
              <TouchableOpacity key={rt.id} onPress={() => setRingtone(rt)}
                style={[styles.optionRow, ringtone.id === rt.id && styles.optionActive]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, ringtone.id === rt.id && { color: C.rose }]}>{rt.label}</Text>
                  <Text style={styles.optionSub}>{rt.desc}</Text>
                </View>
                {ringtone.id === rt.id && <View style={styles.checkDot}><Text style={{ color: '#fff', fontSize: 11 }}>✓</Text></View>}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>⏱️ Call arrives in</Text>
            <View style={styles.delayRow}>
              {[0, 5, 15, 30].map(d => (
                <TouchableOpacity key={d} onPress={() => setDelay(d)} style={[styles.delayBtn, delay === d && styles.delayBtnActive]}>
                  <Text style={[styles.delayText, delay === d && { color: '#fff' }]}>{d === 0 ? 'Now' : `${d}s`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {!tts.available && (
            <View style={[styles.sectionCard, { borderColor: '#F39C12', backgroundColor: '#FEF9E7' }]}>
              <Text style={{ fontSize: 12, color: '#9A6400' }}>
                ⚠️ No text-to-speech voice is installed on this phone, so the caller's lines will show as subtitles only.
                Install a voice in Android Settings → Accessibility → Text-to-speech.
              </Text>
            </View>
          )}

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

  // ── WAITING (looks like a normal dark screen; tap to cancel) ──────────────
  if (phase === 'waiting') {
    return (
      <TouchableOpacity activeOpacity={1} style={[styles.callScreen, { backgroundColor: '#000', justifyContent: 'center' }]} onLongPress={endCall}>
        <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>{caller.name} will call in {waitLeft}s · long-press to cancel</Text>
      </TouchableOpacity>
    );
  }

  // ── RINGING ───────────────────────────────────────────────────────────────
  if (phase === 'ringing') {
    return (
      <View style={styles.callScreen}>
        <Text style={styles.callStatus}>INCOMING CALL</Text>
        <Animated.View style={[styles.avatarWrap, { transform: [{ scale: pulse }] }]}>
          <View style={styles.ring1} /><View style={styles.ring2} />
          <View style={styles.avatar}><Text style={{ fontSize: 60 }}>{caller.emoji}</Text></View>
        </Animated.View>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.callerName}>{caller.name}</Text>
          <Text style={styles.callerRelation}>Mobile · {caller.relation}</Text>
        </View>
        <View style={styles.callBtns}>
          <TouchableOpacity onPress={endCall} style={[styles.callBtn, { backgroundColor: '#E74C3C' }]}>
            <Text style={{ fontSize: 28 }}>📵</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={answer} style={[styles.callBtn, { backgroundColor: '#27AE60' }]}>
            <Text style={{ fontSize: 28 }}>📞</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── ON CALL: spoken lines + synced subtitles ──────────────────────────────
  if (phase === 'answered') {
    const shown = caller.script.slice(0, lineIdx + 1);
    const current = caller.script[lineIdx];
    return (
      <View style={styles.callScreen}>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.callStatus}>{caller.name.toUpperCase()}</Text>
          <Text style={styles.callTimer}>{fmt(callSec)}</Text>
        </View>
        <View style={[styles.avatar, { width: 90, height: 90 }]}><Text style={{ fontSize: 46 }}>{caller.emoji}</Text></View>

        {/* Current line, large — what is being said right now */}
        <View style={styles.subtitleBox}>
          {current ? (
            <>
              <Text style={[styles.subtitleWho, { color: current.who === 'caller' ? '#FFD6E8' : '#B9F6CA' }]}>
                {current.who === 'caller' ? `${caller.name}${muted ? ' (muted)' : ''}` : 'You say'}
              </Text>
              <Text style={styles.subtitleText}>“{current.text}”</Text>
            </>
          ) : <Text style={styles.subtitleWho}>Connecting…</Text>}
        </View>

        {/* Transcript */}
        <ScrollView ref={scrollRef} style={styles.transcript} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {shown.slice(0, -1).map((l, i) => (
            <Text key={i} style={[styles.transcriptLine, l.who === 'you' && { color: 'rgba(185,246,202,0.7)', textAlign: 'right' }]}>
              {l.who === 'caller' ? `${caller.name}: ` : 'You: '}{l.text}
            </Text>
          ))}
        </ScrollView>

        <View style={styles.callActions}>
          <TouchableOpacity style={styles.callAction} onPress={toggleMute}>
            <Text style={{ fontSize: 26 }}>{muted ? '🔇' : '🔊'}</Text>
            <Text style={styles.callActionLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={endCall} style={styles.endBtn}><Text style={{ fontSize: 28 }}>📵</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.callScreen}>
      <Text style={styles.callStatus}>CALL ENDED</Text>
      <View style={styles.avatar}><Text style={{ fontSize: 60 }}>{caller.emoji}</Text></View>
      <Text style={styles.callerName}>{caller.name}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>{fmt(callSec)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: C.bg },
  setupHeader:      { padding: 24, paddingTop: 50, paddingBottom: 26 },
  backBtn:          { marginBottom: 10 },
  setupTitle:       { color: '#fff', fontSize: 22, fontWeight: '800' },
  setupSub:         { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4, lineHeight: 17 },
  sectionCard:      { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border },
  sectionTitle:     { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 12 },
  optionRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent', marginBottom: 6 },
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
  callScreen:       { flex: 1, backgroundColor: '#1A0A28', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 50, paddingHorizontal: 24 },
  callStatus:       { color: 'rgba(255,255,255,0.6)', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  callTimer:        { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 4 },
  avatarWrap:       { alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  ring1:            { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },
  ring2:            { position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  avatar:           { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  callerName:       { color: '#fff', fontSize: 28, fontWeight: '800' },
  callerRelation:   { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 },
  callBtns:         { flexDirection: 'row', gap: 70 },
  callBtn:          { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  subtitleBox:      { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 18, padding: 16, width: '100%', minHeight: 96, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  subtitleWho:      { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6, textAlign: 'center' },
  subtitleText:     { color: '#fff', fontSize: 18, textAlign: 'center', lineHeight: 25 },
  transcript:       { width: '100%', maxHeight: 130, marginTop: 8 },
  transcriptLine:   { color: 'rgba(255,214,232,0.7)', fontSize: 12, marginBottom: 4 },
  callActions:      { flexDirection: 'row', gap: 30 },
  callAction:       { alignItems: 'center', gap: 6 },
  callActionLabel:  { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  endBtn:           { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' },
});
