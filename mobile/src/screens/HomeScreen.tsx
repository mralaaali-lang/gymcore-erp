import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import QRPass from '../components/QRPass';
import VisitCard from '../components/VisitCard';
import * as api from '../services/api';

export default function HomeScreen() {
  const [profile, setProfile] = useState<api.MemberProfile | null>(null);
  const [visits, setVisits] = useState<api.AttendanceLog[]>([]);
  const [subscription, setSubscription] = useState<api.SubscriptionInfo | null>(null);
  const [loyalty, setLoyalty] = useState<api.LoyaltyInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [p, v, s, l] = await Promise.all([
        api.getMemberProfile().catch(() => null),
        api.getRecentVisits().catch(() => []),
        api.getMySubscription().catch(() => null),
        api.getLoyaltyInfo().catch(() => null),
      ]);
      if (p) setProfile(p);
      if (v) setVisits(v);
      if (s) setSubscription(s);
      if (l) setLoyalty(l);
    } catch {}
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.end_date).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.header}>
        <Text style={styles.greeting}>مرحباً بعودتك</Text>
        <Text style={styles.name}>{profile?.full_name || 'عضو جيماوي'}</Text>
      </View>

      <QRPass />

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{subscription?.status === 'active' ? 'نشطة' : 'غير نشطة'}</Text>
          <Text style={styles.statLabel}>العضوية</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#f97316' }]}>{daysLeft}</Text>
          <Text style={styles.statLabel}>الأيام المتبقية</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#006c49' }]}>{loyalty?.points_balance || 0}</Text>
          <Text style={styles.statLabel}>نقاط الولاء</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>آخر الزيارات</Text>
        {visits.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد زيارات حديثة</Text>
        ) : (
          visits.slice(0, 5).map((v) => <VisitCard key={v.id} visit={v} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9ff' },
  header: { backgroundColor: '#f97316', padding: 24, paddingBottom: 60 },
  greeting: { fontSize: 20, fontWeight: '700', color: 'white' },
  name: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 16 },
  statCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#e8e8e8',
  },
  statValue: { fontSize: 18, fontWeight: '700', color: '#006c49' },
  statLabel: { fontSize: 11, color: '#999', marginTop: 2 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 10 },
  emptyText: { textAlign: 'center', color: '#999', paddingVertical: 20, fontSize: 14 },
});
