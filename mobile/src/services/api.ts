import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = __DEV__ ? 'http://10.0.2.2:4000' : 'https://api.gimawi.com';

const api = axios.create({ baseURL: API_BASE, timeout: 10000 });

const TOKEN_KEY = 'gimawi_access_token';
const MEMBER_KEY = 'gimawi_member_data';

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, MEMBER_KEY]);
}

api.interceptors.request.use(async (config) => {
  const token = await getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await clearAuth();
    }
    return Promise.reject(error);
  }
);

export interface MemberProfile {
  id: string; full_name: string; phone_number: string;
  email?: string; photo_url?: string;
}

export interface AttendanceLog {
  id: string; check_in_time: string; entry_method: string;
}

export interface SubscriptionInfo {
  id: string; plan_name: string; status: string;
  start_date: string; end_date: string;
}

export interface FitnessClass {
  id: string; name: string; trainer_name: string;
  start_time: string; end_time: string; day: string;
  capacity: number; booked: number;
}

export interface LoyaltyInfo {
  points_balance: number; tier: string;
}

export async function loginAsMember(phone: string, pin: string): Promise<{ token: string; member: MemberProfile }> {
  const res = await api.post('/auth/member-login', { phone, pin });
  await setStoredToken(res.data.access_token);
  return res.data;
}

export async function getMemberProfile(): Promise<MemberProfile> {
  const res = await api.get('/api/members/me');
  return res.data.data || res.data;
}

export async function getRecentVisits(): Promise<AttendanceLog[]> {
  const res = await api.get('/api/attendance/my-visits');
  return res.data?.data || [];
}

export async function getMySubscription(): Promise<SubscriptionInfo> {
  const res = await api.get('/api/subscriptions/my');
  return res.data?.data || res.data;
}

export async function getUpcomingClasses(): Promise<FitnessClass[]> {
  const res = await api.get('/api/classes/upcoming');
  return res.data?.data || [];
}

export async function bookClass(classId: string): Promise<void> {
  await api.post('/api/classes/book', { class_id: classId });
}

export async function getLoyaltyInfo(): Promise<LoyaltyInfo> {
  const res = await api.get('/api/loyalty/my-points');
  return res.data?.data || { points_balance: 0, tier: 'bronze' };
}

export async function getMember360(): Promise<any> {
  const res = await api.get('/api/customer360/me');
  return res.data?.data || res.data;
}
