import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { AttendanceLog } from '../services/api';

export default function VisitCard({ visit }: { visit: AttendanceLog }) {
  const date = new Date(visit.check_in_time).toLocaleDateString('ar-SA');
  const time = new Date(visit.check_in_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  const methodLabel = visit.entry_method === 'qr_code' ? 'QR' : visit.entry_method === 'manual_phone' ? 'يدوي' : visit.entry_method;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.time}>{time}</Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{methodLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#e8e8e8',
  },
  left: {},
  date: { fontSize: 14, color: '#333', fontWeight: '600' },
  time: { fontSize: 12, color: '#999', marginTop: 2 },
  badge: {
    backgroundColor: '#fef3e7', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 11, color: '#f97316', fontWeight: '600' },
});
