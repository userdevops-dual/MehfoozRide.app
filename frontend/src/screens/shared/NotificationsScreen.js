// frontend/src/screens/shared/NotificationsScreen.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { C } from '../../utils/theme';

const DEMO_NOTIFS = [
  { id:'n1', type:'ride',     title:'Ride Completed ✅',             body:'Your ride from DHA to Gulberg is complete. Fare: Rs. 280.',      time:'10 min ago',  read:false },
  { id:'n2', type:'safety',   title:'Guardian Mode Active 👁️',      body:'Your guardian contacts are notified for your upcoming ride.',    time:'1 hr ago',   read:false },
  { id:'n3', type:'promo',    title:'10% Off Your Next Ride 🎉',     body:'Use code MEHFOOZ10 to get 10% discount on your next booking.',  time:'2 hrs ago',  read:true  },
  { id:'n4', type:'ride',     title:'Driver is 3 min away 🚗',       body:'Your driver Fatima Malik is en route. Stay ready!',             time:'Yesterday',  read:true  },
  { id:'n5', type:'system',   title:'Account Verified ✅',           body:'Congratulations! Your Mehfooz Ride account is fully verified.', time:'2 days ago', read:true  },
  { id:'n6', type:'safety',   title:'SOS Alert Sent 🆘',            body:'Your emergency contacts were notified with your live location.', time:'3 days ago', read:true  },
  { id:'n7', type:'ride',     title:'Rate Your Driver ⭐',          body:'How was your ride with Sara Ahmed? Share your feedback.',       time:'4 days ago', read:true  },
  { id:'n8', type:'promo',    title:'Refer a Friend 👯‍♀️',          body:'Invite female friends and both get Rs. 100 wallet credit.',     time:'5 days ago', read:true  },
];

const TYPE_CONFIG = {
  ride:   { bg: C.rosePale,    icon: '🚗', color: C.rose    },
  safety: { bg: C.dangerBg,    icon: '🛡️', color: C.danger  },
  promo:  { bg: C.goldLight,   icon: '🎁', color: '#A07030'  },
  system: { bg: C.successBg,   icon: '⚙️', color: C.success },
};

export default function NotificationsScreen({ navigation }) {
  const [notifs, setNotifs] = useState(DEMO_NOTIFS);
  const [settings, setSettings] = useState({
    rideUpdates:   true,
    safetyAlerts:  true,
    promotions:    false,
    guardianMode:  true,
  });

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = (id) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const deleteNotif = (id) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const toggleSetting = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <View style={s.screen}>
      {/* ── Header ── */}
      <LinearGradient colors={['#5C1448', '#C84B7A']} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={s.headerRow}>
          <Text style={s.title}>Notifications 🔔</Text>
          {unreadCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={s.markAllBtn}>
            <Text style={s.markAllText}>✓ Mark all as read</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>

        {/* ── Notification List ── */}
        {notifs.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 52 }}>🔕</Text>
            <Text style={s.emptyText}>No notifications yet</Text>
          </View>
        ) : (
          <>
            {/* Unread first */}
            {notifs.filter(n => !n.read).length > 0 && (
              <Text style={s.sectionLabel}>NEW</Text>
            )}
            {notifs.filter(n => !n.read).map(n => (
              <NotifCard key={n.id} notif={n} onRead={markRead} onDelete={deleteNotif} />
            ))}

            {notifs.filter(n => n.read).length > 0 && (
              <Text style={s.sectionLabel}>EARLIER</Text>
            )}
            {notifs.filter(n => n.read).map(n => (
              <NotifCard key={n.id} notif={n} onRead={markRead} onDelete={deleteNotif} />
            ))}
          </>
        )}

        {/* ── Notification Preferences ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>⚙️ Notification Preferences</Text>
          {[
            { key: 'rideUpdates',  label: 'Ride Updates',     sub: 'Driver found, arrival, completion' },
            { key: 'safetyAlerts', label: 'Safety Alerts',    sub: 'SOS, route deviation, guardian mode' },
            { key: 'promotions',   label: 'Promotions',       sub: 'Offers, discounts, referral rewards' },
            { key: 'guardianMode', label: 'Guardian Sharing', sub: 'Notify contacts when ride starts' },
          ].map(item => (
            <View key={item.key} style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>{item.label}</Text>
                <Text style={s.settingSub}>{item.sub}</Text>
              </View>
              <Switch
                value={settings[item.key]}
                onValueChange={() => toggleSetting(item.key)}
                trackColor={{ false: '#DDD', true: C.rose }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Single notification card ────────────────────────────────────────────────
function NotifCard({ notif, onRead, onDelete }) {
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
  return (
    <TouchableOpacity
      onPress={() => onRead(notif.id)}
      style={[s.notifCard, !notif.read && s.notifCardUnread]}>
      <View style={[s.notifIcon, { backgroundColor: cfg.bg }]}>
        <Text style={{ fontSize: 20 }}>{cfg.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.notifTitle, !notif.read && { color: C.plum }]}>
          {notif.title}
        </Text>
        <Text style={s.notifBody} numberOfLines={2}>{notif.body}</Text>
        <Text style={s.notifTime}>{notif.time}</Text>
      </View>
      <View style={{ gap: 6, alignItems: 'center' }}>
        {!notif.read && <View style={s.unreadDot} />}
        <TouchableOpacity onPress={() => onDelete(notif.id)} hitSlop={8}>
          <Text style={{ color: C.muted, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: C.bg },
  header:         { padding: 20, paddingBottom: 24 },
  backBtn:        { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 12 },
  backText:       { color: '#fff', fontWeight: '600', fontSize: 13 },
  headerRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title:          { color: '#fff', fontSize: 22, fontWeight: '800' },
  badge:          { backgroundColor: '#fff', borderRadius: 12, minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText:      { color: C.rose, fontWeight: '800', fontSize: 13 },
  markAllBtn:     { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 10 },
  markAllText:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  body:           { flex: 1, padding: 14 },
  sectionLabel:   { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  notifCard:      { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  notifCardUnread:{ borderColor: `${C.rose}60`, backgroundColor: C.roseLight || '#FFF8FC' },
  notifIcon:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  notifTitle:     { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 3 },
  notifBody:      { fontSize: 11, color: C.muted, lineHeight: 16 },
  notifTime:      { fontSize: 10, color: C.muted, marginTop: 5 },
  unreadDot:      { width: 9, height: 9, borderRadius: 5, backgroundColor: C.rose },
  emptyBox:       { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText:      { fontSize: 14, color: C.muted },
  card:           { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardTitle:      { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 14 },
  settingRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  settingLabel:   { fontSize: 13, fontWeight: '600', color: C.text },
  settingSub:     { fontSize: 11, color: C.muted, marginTop: 2 },
});
