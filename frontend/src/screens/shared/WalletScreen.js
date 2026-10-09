// frontend/src/screens/shared/WalletScreen.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, FlatList,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { C } from '../../utils/theme';

// ── Demo transaction data ───────────────────────────────────────────────────
const DEMO_TRANSACTIONS = [
  { id: 't1', type: 'ride',     label: 'DHA → Gulberg III',     amount: -280,  date: '29 Apr, 10:30 AM', icon: '🚗' },
  { id: 't2', type: 'topup',    label: 'Wallet Top-up (EasyPaisa)', amount: 1000, date: '28 Apr, 2:00 PM',  icon: '💳' },
  { id: 't3', type: 'ride',     label: 'Johar Town → Liberty',  amount: -180,  date: '28 Apr, 2:15 PM',  icon: '🚗' },
  { id: 't4', type: 'earning',  label: 'Ride Earned (Driver)',   amount: +240,  date: '27 Apr, 11:00 AM', icon: '💰' },
  { id: 't5', type: 'ride',     label: 'Model Town → Packages', amount: -320,  date: '26 Apr, 9:00 AM',  icon: '🚗' },
  { id: 't6', type: 'topup',    label: 'Wallet Top-up (JazzCash)', amount: 500,  date: '25 Apr, 6:00 PM',  icon: '💳' },
  { id: 't7', type: 'ride',     label: 'Bahria Town → Wapda',   amount: -220,  date: '24 Apr, 4:45 PM',  icon: '🚗' },
];

const TOPUP_OPTIONS = [500, 1000, 2000, 5000];

export default function WalletScreen({ navigation }) {
  const { user } = useAuth();
  const isDriver = user?.role === 'driver';

  const [balance,      setBalance]      = useState(isDriver ? 3740 : 820);
  const [transactions, setTransactions] = useState(DEMO_TRANSACTIONS);
  const [tab,          setTab]          = useState('wallet'); // 'wallet' | 'earnings'

  const totalEarned  = transactions.filter(t => t.type === 'earning').reduce((s, t) => s + t.amount, 0);
  const totalSpent   = transactions.filter(t => t.type === 'ride').reduce((s, t) => s + Math.abs(t.amount), 0);

  const handleTopup = (amount) => {
    const newTx = {
      id: `t${Date.now()}`,
      type: 'topup',
      label: 'Wallet Top-up',
      amount,
      date: new Date().toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      icon: '💳',
    };
    setBalance(b => b + amount);
    setTransactions(prev => [newTx, ...prev]);
  };

  return (
    <View style={s.screen}>
      {/* ── Header ── */}
      <LinearGradient colors={['#5C1448', '#C84B7A']} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>{isDriver ? '💰 Earnings Wallet' : '💳 My Wallet'}</Text>

        {/* Balance Card */}
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>Available Balance</Text>
          <Text style={s.balanceAmount}>Rs. {balance.toLocaleString()}</Text>
          <View style={s.balanceRow}>
            <View style={s.balanceStat}>
              <Text style={s.balanceStatVal}>Rs. {totalSpent.toLocaleString()}</Text>
              <Text style={s.balanceStatLbl}>Total Spent</Text>
            </View>
            <View style={s.balanceDivider} />
            <View style={s.balanceStat}>
              <Text style={s.balanceStatVal}>{transactions.length}</Text>
              <Text style={s.balanceStatLbl}>Transactions</Text>
            </View>
            {isDriver && <>
              <View style={s.balanceDivider} />
              <View style={s.balanceStat}>
                <Text style={s.balanceStatVal}>Rs. {totalEarned.toLocaleString()}</Text>
                <Text style={s.balanceStatLbl}>Earned</Text>
              </View>
            </>}
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>

        {/* ── Top-up Section (Passenger only) ── */}
        {!isDriver && (
          <View style={s.card}>
            <Text style={s.cardTitle}>⚡ Quick Top-up</Text>
            <Text style={s.cardSub}>Add funds via JazzCash or EasyPaisa (simulated)</Text>
            <View style={s.topupGrid}>
              {TOPUP_OPTIONS.map(amt => (
                <TouchableOpacity key={amt} onPress={() => handleTopup(amt)}
                  style={s.topupBtn}>
                  <Text style={s.topupAmount}>Rs. {amt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.payNote}>
              <Text style={s.payNoteText}>
                💡 In production, this integrates with JazzCash / EasyPaisa payment gateway
              </Text>
            </View>
          </View>
        )}

        {/* ── Driver Earnings Summary ── */}
        {isDriver && (
          <View style={s.card}>
            <Text style={s.cardTitle}>📊 Earnings Summary</Text>
            {[
              { lbl: "Today's Earnings",  val: 'Rs. 840',   icon: '📅' },
              { lbl: 'This Week',         val: 'Rs. 3,740', icon: '📆' },
              { lbl: 'Total Rides Given', val: `${user?.totalRides || 42}`,  icon: '🚗' },
              { lbl: 'Average Rating',    val: `${(user?.averageRating || 4.8).toFixed(1)} ⭐`, icon: '⭐' },
            ].map(item => (
              <View key={item.lbl} style={s.earningRow}>
                <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                <Text style={s.earningLbl}>{item.lbl}</Text>
                <Text style={s.earningVal}>{item.val}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Transaction History ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📋 Transaction History</Text>
          {transactions.map(t => (
            <View key={t.id} style={s.txRow}>
              <View style={[s.txIcon, {
                backgroundColor: t.type === 'topup' ? C.successBg
                  : t.type === 'earning' ? '#FFF9E6'
                  : C.rosePale,
              }]}>
                <Text style={{ fontSize: 18 }}>{t.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.txLabel} numberOfLines={1}>{t.label}</Text>
                <Text style={s.txDate}>{t.date}</Text>
              </View>
              <Text style={[s.txAmount, {
                color: t.amount > 0 ? C.success : C.rose,
              }]}>
                {t.amount > 0 ? '+' : ''}Rs. {Math.abs(t.amount)}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Payment Methods Note ── */}
        <View style={[s.card, { backgroundColor: C.infoBg, borderColor: `${C.info}30` }]}>
          <Text style={[s.cardTitle, { color: C.info }]}>💡 Payment Methods</Text>
          {[
            'JazzCash (integration ready)',
            'EasyPaisa (integration ready)',
            'Bank card — coming soon',
            'Cash — accepted by all drivers',
          ].map((m, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 7 }}>
              <Text style={{ color: C.info }}>•</Text>
              <Text style={{ fontSize: 12, color: '#1a4a80', flex: 1 }}>{m}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: C.bg },
  header:          { padding: 20, paddingBottom: 28 },
  backBtn:         { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 14 },
  backText:        { color: '#fff', fontWeight: '600', fontSize: 13 },
  title:           { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 16 },
  balanceCard:     { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 18 },
  balanceLabel:    { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 4 },
  balanceAmount:   { color: '#fff', fontSize: 34, fontWeight: '900', marginBottom: 16 },
  balanceRow:      { flexDirection: 'row', alignItems: 'center' },
  balanceStat:     { flex: 1, alignItems: 'center' },
  balanceStatVal:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  balanceStatLbl:  { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 2 },
  balanceDivider:  { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.3)' },
  body:            { flex: 1, padding: 14 },
  card:            { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardTitle:       { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 },
  cardSub:         { fontSize: 11, color: C.muted, marginBottom: 14 },
  topupGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  topupBtn:        { flex: 1, minWidth: '45%', backgroundColor: C.rosePale, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: `${C.rose}40` },
  topupAmount:     { color: C.rose, fontWeight: '700', fontSize: 14 },
  payNote:         { backgroundColor: C.goldLight, borderRadius: 12, padding: 10 },
  payNoteText:     { fontSize: 11, color: '#A07030' },
  earningRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  earningLbl:      { flex: 1, fontSize: 13, color: C.text },
  earningVal:      { fontSize: 13, fontWeight: '700', color: C.rose },
  txRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  txIcon:          { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  txLabel:         { fontSize: 12, fontWeight: '600', color: C.text },
  txDate:          { fontSize: 10, color: C.muted, marginTop: 2 },
  txAmount:        { fontSize: 13, fontWeight: '800' },
});
