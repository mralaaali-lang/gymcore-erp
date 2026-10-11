import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import * as api from '../services/api';

const TIPS = [
  'اشرب 2-3 لتر من الماء يومياً',
  'احصل على 7-8 ساعات نوم للتعافي',
  'نوّع بين تمارين الكارديو والمقاومة',
  'خذ 48 ساعة راحة بين تمارين نفس العضلة',
  'سجّل تقدمك أسبوعياً لتحفيز نفسك',
];

export default function ProgressScreen() {
  const [member360, setMember360] = useState<any>(null);
  const [loyalty, setLoyalty] = useState<api.LoyaltyInfo | null>(null);

  useEffect(() => {
    Promise.all([
      api.getMember360().then(setMember360).catch(() => {}),
      api.getLoyaltyInfo().then(setLoyalty).catch(() => {}),
    ]);
  }, []);

  const tierColors: Record<string, string> = {
    bronze: '#cd7f32', silver: '#a0a0a0', gold: '#ffd700', platinum: '#00bcd4',
  };
  const tierNames: Record<string, string> = {
    bronze: 'برونزي', silver: 'فضي', gold: 'ذهبي', platinum: 'بلاتيني',
  };

  const stats = member360?.stats || {};
  const totalCheckins = stats.total_checkins || 0;
  const checkins30d = stats.checkins_30d || 0;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>تقدمي الرياضي</Text>
        <Text style={styles.subtitle}>تابع إنجازاتك وأهدافك</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{totalCheckins}</Text>
          <Text style={styles.statDesc}>إجمالي الزيارات</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{checkins30d}</Text>
          <Text style={styles.statDesc}>آخر 30 يوم</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{member360?.subscriptions?.length || 0}</Text>
          <Text style={styles.statDesc}>الاشتراكات</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{member360?.payments?.length || 0}</Text>
          <Text style={styles.statDesc}>المدفوعات</Text>
        </View>
      </View>

      {loyalty && (
        <View style={[styles.loyaltyCard, { borderColor: tierColors[loyalty.tier] || '#cd7f32' }]}>
          <View style={styles.loyaltyHeader}>
            <Text style={styles.loyaltyTier}>{tierNames[loyalty.tier] || loyalty.tier}</Text>
            <Text style={styles.loyaltyPoints}>{loyalty.points_balance.toLocaleString()} نقطة</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>نصائح اللياقة</Text>
        {TIPS.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9ff' },
  header: { backgroundColor: '#1a1a2e', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: 'white' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8,
  },
  statBox: {
    width: '47%', backgroundColor: 'white', borderRadius: 14, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#e8e8e8',
  },
  statNumber: { fontSize: 28, fontWeight: '800', color: '#f97316' },
  statDesc: { fontSize: 12, color: '#999', marginTop: 4 },
  loyaltyCard: {
    marginHorizontal: 16, backgroundColor: 'white', borderRadius: 16, padding: 20,
    borderWidth: 2, borderLeftWidth: 6, marginBottom: 12,
  },
  loyaltyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loyaltyTier: { fontSize: 18, fontWeight: '700', color: '#333' },
  loyaltyPoints: { fontSize: 16, fontWeight: '700', color: '#f97316' },
  section: { paddingHorizontal: 16, marginTop: 8, paddingBottom: 30 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 10 },
  tipRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
  tipBullet: { fontSize: 16, color: '#f97316', marginRight: 8, fontWeight: '700' },
  tipText: { fontSize: 14, color: '#555', flex: 1 },
});
