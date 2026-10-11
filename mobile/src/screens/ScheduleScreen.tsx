import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as api from '../services/api';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function ScheduleScreen() {
  const [classes, setClasses] = useState<api.FitnessClass[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClasses = async () => {
    try {
      const data = await api.getUpcomingClasses();
      setClasses(data);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClasses(); }, []);

  const handleBook = async (classId: string, name: string) => {
    try {
      await api.bookClass(classId);
      Alert.alert('تم', `تم حجز حصة ${name} بنجاح`);
      loadClasses();
    } catch (e: any) {
      Alert.alert('خطأ', e?.response?.data?.error || 'فشل الحجز');
    }
  };

  const grouped = DAYS.map((day) => ({
    day,
    classes: classes.filter((c) => c.day === day),
  }));

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>جدول الحصص</Text>
        <Text style={styles.subtitle}>اختر الحصة التي تناسبك</Text>
      </View>

      {loading ? (
        <Text style={styles.loading}>جاري التحميل...</Text>
      ) : (
        grouped.map(({ day, classes: dayClasses }) => (
          dayClasses.length > 0 && (
            <View key={day} style={styles.daySection}>
              <Text style={styles.dayTitle}>{day}</Text>
              {dayClasses.map((c) => {
                const available = c.capacity - c.booked;
                return (
                  <View key={c.id} style={styles.classCard}>
                    <View style={styles.classInfo}>
                      <Text style={styles.className}>{c.name}</Text>
                      <Text style={styles.classMeta}>
                        {c.trainer_name} • {c.start_time} - {c.end_time}
                      </Text>
                      <Text style={styles.classCapacity}>
                        {available > 0
                          ? `${available} مقعد متاح من أصل ${c.capacity}`
                          : 'مكتمل'}
                      </Text>
                    </View>
                    {available > 0 && (
                      <TouchableOpacity
                        style={styles.bookBtn}
                        onPress={() => handleBook(c.id, c.name)}
                      >
                        <Text style={styles.bookBtnText}>حجز</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9ff' },
  header: { backgroundColor: '#006c49', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: 'white' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  loading: { textAlign: 'center', padding: 40, color: '#999' },
  daySection: { padding: 16 },
  dayTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 10 },
  classCard: {
    backgroundColor: 'white', borderRadius: 14, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e8e8e8',
  },
  classInfo: { flex: 1 },
  className: { fontSize: 15, fontWeight: '600', color: '#333' },
  classMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  classCapacity: { fontSize: 11, color: '#f97316', marginTop: 2 },
  bookBtn: {
    backgroundColor: '#f97316', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10,
  },
  bookBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
});
