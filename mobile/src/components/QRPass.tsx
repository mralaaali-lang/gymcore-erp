import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

function generateToken(memberId: string): string {
  const timestamp = Date.now();
  const payload = { member_id: memberId, timestamp, signature: 'mobile-' + Math.random().toString(36).substring(2, 15) };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export default function QRPass() {
  const [token, setToken] = useState('');
  const [memberId, setMemberId] = useState('member-001');
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    AsyncStorage.getItem('member_id').then((id) => {
      if (id) setMemberId(id);
    });
  }, []);

  const refresh = useCallback(() => {
    setToken(generateToken(memberId));
    setSecondsLeft(30);
  }, [memberId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [token]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>بطاقة الدخول الرقمية</Text>
        <View style={styles.qrWrapper}>
          {token ? (
            <QRCode value={token} size={200} backgroundColor="white" color="#1a1a2e" />
          ) : (
            <View style={[styles.qrPlaceholder]} />
          )}
        </View>
        <Text style={styles.memberName}>{memberId.replace('member-', 'عضو ')}</Text>
        <View style={styles.timerRow}>
          <Text style={[styles.timer, secondsLeft <= 5 && { color: '#e74c3c' }]}>
            {secondsLeft} ثانية
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginTop: -40 },
  card: {
    backgroundColor: 'white', borderRadius: 20, padding: 24,
    alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 8,
  },
  title: { fontSize: 14, color: '#f97316', fontWeight: '700', marginBottom: 16 },
  qrWrapper: {
    backgroundColor: 'white', padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  qrPlaceholder: { width: 200, height: 200, backgroundColor: '#f0f0f0', borderRadius: 8 },
  memberName: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginTop: 12 },
  timerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  timer: { fontSize: 14, fontWeight: '700', color: '#666', fontFamily: 'monospace' },
});
