import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../services/auth';

export default function LoginScreen() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone.trim() || !pin.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال رقم الهاتف والرمز السري');
      return;
    }
    setLoading(true);
    try {
      await login(phone.trim(), pin.trim());
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'فشل تسجيل الدخول. تحقق من البيانات';
      Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoSection}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>ج</Text>
        </View>
        <Text style={styles.appName}>جيماوي</Text>
        <Text style={styles.tagline}>نظام إدارة المنشآت الرياضية</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.formTitle}>تسجيل دخول الأعضاء</Text>

        <Text style={styles.label}>رقم الهاتف</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="05xxxxxxxx"
          keyboardType="phone-pad"
          autoCapitalize="none"
          placeholderTextColor="#aaa"
        />

        <Text style={styles.label}>الرمز السري</Text>
        <TextInput
          style={styles.input}
          value={pin}
          onChangeText={setPin}
          placeholder="****"
          secureTextEntry
          keyboardType="number-pad"
          placeholderTextColor="#aaa"
        />

        <TouchableOpacity
          style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.loginBtnText}>تسجيل الدخول</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9ff', justifyContent: 'center' },
  logoSection: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fef3e7', justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  logoText: { fontSize: 32, fontWeight: '800', color: '#f97316' },
  appName: { fontSize: 28, fontWeight: '800', color: '#1a1a2e' },
  tagline: { fontSize: 13, color: '#999', marginTop: 4 },
  form: { paddingHorizontal: 32 },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: 'white', borderRadius: 12, padding: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#e0e0e0', color: '#333',
  },
  loginBtn: {
    backgroundColor: '#f97316', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 28,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
