import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Remove plaintext credentials saved by older login-page builds as soon as
// the app starts, including sessions that open directly on a dashboard.
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('gymcore_admin_pass');
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

interface TokenPayload {
  staff_user_id?: string;
  gym_id: string;
  role: string;
  iat: number;
  exp: number;
}

// Access token lives only in memory â€” never persisted to storage (XSS mitigation)
let inMemoryAccessToken: string | null = null;
let platformCsrfTokenRequest: Promise<string> | null = null;

function decodeJWT(token: string): TokenPayload | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function getAccessToken(): string | null {
  if (inMemoryAccessToken) return inMemoryAccessToken;
  // Staff access tokens fall back to session storage after a page refresh.
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  // Guard against the literal "undefined"/"null" strings older builds stored
  // when the cookie-only login response had no body tokens — a junk bearer
  // header would override valid HttpOnly cookie auth server-side.
  if (!token || token === 'undefined' || token === 'null') return null;
  return token;
}

function getRefreshToken(): string | null {
  const token = sessionStorage.getItem('refresh_token') || localStorage.getItem('refresh_token');
  if (!token || token === 'undefined' || token === 'null') return null;
  return token;
}

export function setTokens(access: string, refresh: string, persistent = false, role?: string) {
  // Staff auth is HttpOnly-cookie-based: /auth/login and /auth/refresh set
  // cookies and return no tokens in the body. Storing the undefined values
  // used to poison the bearer header — only persist real tokens.
  inMemoryAccessToken = access || null;
  if (persistent) {
    if (access) localStorage.setItem('access_token', access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
    if (role) localStorage.setItem('app_role', role);
  } else {
    if (access) sessionStorage.setItem('access_token', access);
    if (refresh) sessionStorage.setItem('refresh_token', refresh);
    if (role) sessionStorage.setItem('app_role', role);
  }
}

/** Mark a platform-admin session authenticated by the server's HttpOnly cookie. */
export function setPlatformCookieSession(role = 'super-admin') {
  clearTokens();
  platformCsrfTokenRequest = null;
  localStorage.setItem('app_role', role);
}

function clearTokens() {
  inMemoryAccessToken = null;
  sessionStorage.removeItem('refresh_token');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('app_role');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('app_role');
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload) return true;
  return Date.now() >= payload.exp * 1000;
}
void isTokenExpired;

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (getStoredRole() === 'super-admin') {
    // Platform access tokens are HttpOnly cookies; never send a stale staff
    // bearer token alongside them (the server correctly prioritizes Bearer).
    config.headers.delete('Authorization');
  } else if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method || 'get').toUpperCase();
  const path = config.url || '';
  const isPlatformMutation = path.includes('/platform/')
    && !['GET', 'HEAD', 'OPTIONS'].includes(method)
    && !/^\/platform\/auth\/(?:login|refresh|logout)$/.test(path);

  if (getStoredRole() === 'super-admin' && isPlatformMutation) {
    if (!platformCsrfTokenRequest) {
      platformCsrfTokenRequest = axios
        .get<{ csrfToken: string }>(`${API_BASE}/platform/csrf-token`, { withCredentials: true })
        .then((response) => {
          return response.data.csrfToken;
        })
        .finally(() => {
          platformCsrfTokenRequest = null;
        });
    }
    config.headers['X-CSRF-Token'] = await platformCsrfTokenRequest;
  }

  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error);
    } else {
      p.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Re-attach the junk-token guard: a poisoned header must not ride on
      // the retry either.
      originalRequest.headers.delete?.('Authorization');

      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        // Platform (super-admin) session: fully cookie-based with its own
        // /platform/auth/refresh — never route it through the staff refresh
        // endpoint below (that would clear a valid platform session).
        if (getStoredRole() === 'super-admin') {
          clearTokens();
          window.location.href = '/login';
          return Promise.reject(error);
        }
        // Cookie-session case (staff logins keep tokens in HttpOnly cookies,
        // nothing in storage). Try the cookie-based refresh once before
        // giving up — the backend falls back to the refresh cookie when the
        // body token is absent.
        if (!isRefreshing) {
          originalRequest._retry = true;
          isRefreshing = true;
          try {
            await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
            return api(originalRequest);
          } catch {
            clearTokens();
            window.location.href = '/login';
            return Promise.reject(error);
          } finally {
            isRefreshing = false;
          }
        }
        // Another refresh is in flight — retry against the fresh cookie.
        originalRequest._retry = true;
        return api(originalRequest);
      }

      if (isRefreshing) {
        return new Promise<string | undefined>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (token) originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(`${API_BASE}/auth/refresh`, {
          refresh_token: refreshToken,
        }, { withCredentials: true });

        const { access_token, refresh_token: newRefresh } = res.data;
        setTokens(access_token, newRefresh);
        processQueue(null, access_token);

        if (access_token) originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export function getGymId(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  const payload = decodeJWT(token);
  return payload?.gym_id || null;
}

export function getStaffRole(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  const payload = decodeJWT(token);
  return payload?.role || null;
}

export function getStaffId(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  const payload = decodeJWT(token);
  return payload?.staff_user_id || null;
}

export function isAuthenticated(): boolean {
  return inMemoryAccessToken !== null || getRefreshToken() !== null || getStoredRole() === 'super-admin';
}

export function getStoredRole(): string | null {
  return localStorage.getItem('app_role') || sessionStorage.getItem('app_role') || null;
}

/** Minimal tenant block returned by /auth/me (§24) — replaces the platform-only
 *  /platform/gyms/:id call that 403s for gym managers. */
export interface GymBrief {
  id: string;
  name: string;
  subdomain: string;
  plan_tier?: string;
  currency?: string;
  subscription_status?: string;
  is_active?: boolean;
  trial_end?: string | null;
  trial_days_remaining?: number | null;
  /** §36 — effective module keys (plan modules + live add-ons), from
   *  gym_effective_features(); drives sidebar gating. Undefined = old backend. */
  features?: string[];
}

export interface RestoredSession {
  role: string;
  gym_id: string | null;
  full_name?: string;
  email?: string;
  gym?: GymBrief | null;
}

export function tryRestoreSession(): Promise<RestoredSession | null> {
  if (getStoredRole() === 'super-admin') {
    // Old builds stored the string "undefined" as an access token. Remove any
    // legacy bearer values while preserving the role marker, then validate the
    // HttpOnly session cookie with the backend.
    inMemoryAccessToken = null;
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    return axios
      .get(`${API_BASE}/platform/auth/session`, { withCredentials: true })
      .then(() => ({ role: 'super-admin', gym_id: null }))
      .catch(() => {
        clearTokens();
        return null;
      });
  }

  // Staff & member sessions are HttpOnly-cookie based — restore by asking the
  // backend who we are. If the short-lived access cookie has expired, rotate
  // via the refresh cookie and ask again.
  const me = () =>
    axios
      .get(`${API_BASE}/auth/me`, { withCredentials: true })
      .then((res) => {
        const u = res.data?.user;
        return u
          ? {
              role: String(u.role),
              gym_id: (u.gym_id as string) || null,
              full_name: u.full_name,
              email: u.email,
              gym: (res.data?.gym as GymBrief) || null,
            }
          : null;
      });

  return me()
    .catch(() => axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true }).then(me))
    .catch(() => {
      clearTokens();
      return null;
    });
}

// ====================================================================
// AUTH
// ====================================================================
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { id: string; full_name: string; email: string; role: string; gym_id: string };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await api.post('/auth/login', { email, password });
  const data = res.data as LoginResponse;
  setTokens(data.access_token, data.refresh_token);
  return data;
}

// ====================================================================
// PLATFORM ADMIN LOGIN (true, cross-tenant Super Admin — separate
// credential space from staff_users, see server/src/controllers/platformAdmin.ts)
// ====================================================================
export interface PlatformAdminLoginResponse {
  expires_in: number;
  admin: { id: string; email: string; full_name: string; role_type: string };
}

export async function platformAdminLogin(email: string, password: string): Promise<PlatformAdminLoginResponse> {
  const res = await api.post('/platform/auth/login', { email, password });
  const data = res.data as PlatformAdminLoginResponse;
  setPlatformCookieSession();
  return data;
}

// ====================================================================
// FORGOT / RESET PASSWORD
// `accountType` picks which backend credential space to hit — the two are
// completely separate tables (staff_users vs platform_admins).
// ====================================================================
export type AccountType = 'staff' | 'platform';

export async function forgotPassword(email: string, accountType: AccountType): Promise<{ message: string }> {
  const path = accountType === 'platform' ? '/platform/auth/forgot-password' : '/auth/forgot-password';
  const res = await api.post(path, { email });
  return res.data;
}

export async function resetPassword(token: string, newPassword: string, accountType: AccountType): Promise<{ message: string }> {
  const path = accountType === 'platform' ? '/platform/auth/reset-password' : '/auth/reset-password';
  const res = await api.post(path, { token, new_password: newPassword });
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — gym (tenant) directory & provisioning
// ====================================================================
export interface PlatformGym {
  id: string;
  name: string;
  subdomain: string;
  plan_tier: string;
  is_active: boolean;
  created_at: string;
  active_members_count?: number;
  subscription_expires_at?: string | null;
  currency?: string;
  email?: string;
  phone?: string;
  address_street?: string;
  address_city?: string;
  address_country?: string;
  dba_name?: string;
  timezone?: string;
  last_activity_at?: string | null;
  // §40 — أعمدة العقد الفعلي من listGyms (مصدر الحقيقة: platform_contracts)
  tenant_status?: string;
  subscription_status?: string;
  plan_id?: string | null;
  plan_name?: string | null;
  contract_id?: string | null;
  contract_status?: string | null;
  contract_cycle?: string | null;
  contract_price?: string | null;
  contract_currency?: string | null;
  contract_renewal_date?: string | null;
  auto_renew?: boolean | null;
  effective_features?: string[];
  effective_max_members?: number | null;
  effective_max_staff?: number | null;
  live_addon_items?: number;
  on_trial?: boolean;
  trial_end?: string | null;
  active_staff_count?: number;
  active_branches_count?: number;
}

export async function listPlatformGyms(): Promise<{ data: PlatformGym[]; total: number; limit: number; offset: number }> {
  const res = await api.get('/platform/gyms');
  return res.data;
}

/** §40 — نسخة الفلاتر الحقيقية (بحث/حالة/ترتيب) لصفحات الأدمن الجديدة. */
export async function listPlatformGymsFiltered(params: {
  search?: string;
  status?: 'active' | 'suspended' | 'trial' | 'expired';
  sort?: 'name' | 'created_at' | 'members' | 'renewal_date';
  plan_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: PlatformGym[]; total: number; limit: number; offset: number }> {
  const res = await api.get('/platform/gyms', { params });
  return res.data;
}

export interface PlatformGymDetail extends PlatformGym {
  phone?: string;
  email?: string;
  address_city?: string;
  address_country?: string;
  timezone?: string;
  language?: string;
  logo_url?: string;
  dba_name?: string;
  active_staff_count?: number;
  theme_color?: string;
  accent_color?: string;
  custom_domain?: string | null;
  mobile_app_enabled?: boolean;
  website_enabled?: boolean;
}

export async function getPlatformGym(id: string): Promise<{ data: PlatformGymDetail }> {
  const res = await api.get(`/platform/gyms/${id}`);
  return res.data;
}

export interface CreateGymPayload {
  gym_name: string;
  subdomain: string;
  owner_email: string;
  owner_password: string;
  owner_full_name: string;
  plan_tier?: string;
}

export async function createPlatformGym(payload: CreateGymPayload): Promise<{ data: { gym: PlatformGym; owner: { id: string; email: string; full_name: string; role: string } } }> {
  const res = await api.post('/platform/gyms', payload);
  return res.data;
}

export async function setPlatformGymActive(id: string, is_active: boolean): Promise<{ data: PlatformGym }> {
  const res = await api.patch(`/platform/gyms/${id}/active`, { is_active });
  return res.data;
}

export async function updateGymSubscription(id: string, payload: { plan_tier?: string; subscription_expires_at?: string }): Promise<{ data: PlatformGym }> {
  const res = await api.put(`/platform/gyms/${id}/subscription`, payload);
  return res.data;
}

export interface UpdateGymFullPayload {
  gym_name?: string;
  dba_name?: string;
  phone?: string;
  gym_email?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  address_country?: string;
  timezone?: string;
  date_format?: string;
  time_format?: string;
  first_day_of_week?: string;
  language?: string;
  units_system?: string;
  logo_url?: string;
  currency?: string;
  plan_tier?: string;
  subscription_expires_at?: string;
  is_active?: boolean;
}

export async function updateGymFull(id: string, payload: UpdateGymFullPayload): Promise<{ data: PlatformGym }> {
  const res = await api.put(`/platform/gyms/${id}`, payload);
  return res.data;
}

export async function deleteGym(id: string): Promise<{ data: { id: string; name: string; deleted: boolean } }> {
  const res = await api.delete(`/platform/gyms/${id}`, { data: { confirmation: 'DELETE' } });
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — Impersonation (Super Admin → Gym Manager)
// ====================================================================
export async function impersonateGym(gymId: string): Promise<{ data: { access_token: string; gym_id: string; user: { id: string; email: string; full_name: string; role: string } } }> {
  const res = await api.post(`/platform/gyms/${gymId}/impersonate`);
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — Platform Admins Management (RBAC)
// ====================================================================
export type PlatformAdminRole = 'super_admin' | 'billing_admin' | 'support_admin' | 'readonly_admin';

export interface PlatformAdminUser {
  id: string;
  email: string;
  phone_number: string | null;
  full_name: string;
  is_active: boolean;
  role_type: PlatformAdminRole;
  last_login_at?: string | null;
  created_at: string;
}

export async function listPlatformAdmins(): Promise<{ data: PlatformAdminUser[] }> {
  const res = await api.get('/platform/admins');
  return res.data;
}

export async function createPlatformAdmin(payload: { email: string; phone_number?: string | null; password: string; full_name: string; role_type?: PlatformAdminRole }): Promise<{ data: PlatformAdminUser }> {
  const res = await api.post('/platform/admins', payload);
  return res.data;
}

export async function updatePlatformAdmin(id: string, payload: { email?: string; phone_number?: string | null; password?: string; full_name?: string; is_active?: boolean; role_type?: PlatformAdminRole }): Promise<{ data: PlatformAdminUser }> {
  const res = await api.patch(`/platform/admins/${id}`, payload);
  return res.data;
}

export async function deletePlatformAdmin(id: string): Promise<{ data: { message: string } }> {
  const res = await api.delete(`/platform/admins/${id}`);
  return res.data;
}

export interface CreateGymWizardPayload extends CreateGymPayload {
  subscription_expires_at?: string;
  is_active?: boolean;
  plan_id?: string;
  billing_cycle?: string;
  dba_name?: string;
  phone?: string;
  gym_email?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  address_country?: string;
  timezone?: string;
  date_format?: string;
  time_format?: string;
  first_day_of_week?: string;
  language?: string;
  units_system?: string;
  logo_url?: string;
  currency?: string;
}

export async function uploadGymLogo(file: File): Promise<{ data: { url: string } }> {
  const formData = new FormData();
  formData.append('logo', file);
  const res = await api.post('/platform/upload/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function uploadMemberPhoto(file: File): Promise<{ data: { url: string } }> {
  const formData = new FormData();
  formData.append('photo', file);
  const res = await api.post('/api/upload/photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// ====================================================================
// MEMBER LOGIN (PWA / Mobile Web)
// ====================================================================
export interface MemberLoginResponse {
  access_token: string;
  member: {
    id: string;
    full_name: string;
    phone_number: string;
    email?: string;
    photo_url?: string;
    gym_id: string;
  };
}

export async function memberLogin(phone: string, pin: string, loginType?: string): Promise<MemberLoginResponse> {
  const res = await api.post('/auth/member-login', { phone, pin, loginType });
  const data = res.data as MemberLoginResponse;
  setTokens(data.access_token, '');
  return data;
}

export async function refreshToken(): Promise<LoginResponse> {
  const token = getRefreshToken();
  if (!token) throw new Error('No refresh token');
  const res = await api.post('/auth/refresh', { refresh_token: token });
  const data = res.data as LoginResponse;
  setTokens(data.access_token, data.refresh_token);
  return data;
}

// ====================================================================
// SESSION MANAGEMENT
// ====================================================================
export interface UserSession {
  id: string;
  token_jti: string;
  user_agent: string | null;
  ip_address: string | null;
  device_name: string | null;
  last_active_at: string;
  created_at: string;
}

export async function listSessions(): Promise<UserSession[]> {
  const res = await api.get('/api/auth/sessions');
  return res.data.data;
}

export async function revokeSession(jti: string): Promise<void> {
  await api.delete(`/api/auth/sessions/${jti}`);
}

export async function revokeAllOtherSessions(): Promise<{ revoked: number }> {
  const res = await api.post('/api/auth/sessions/revoke-others');
  return res.data;
}

const TEAM_ROLES = new Set(['coach', 'receptionist', 'member']);

export function logout() {
  const wasPlatformAdmin = getStoredRole() === 'super-admin';
  const currentToken = getAccessToken();
  const decoded = currentToken ? decodeJWT(currentToken) : null;
  const wasTeamAccount = decoded ? TEAM_ROLES.has(decoded.role) : false;

  if (wasPlatformAdmin) {
    void axios.post(`${API_BASE}/platform/auth/logout`, {}, { withCredentials: true }).catch(() => {});
  }
  clearTokens();
  platformCsrfTokenRequest = null;
  window.location.href = wasTeamAccount ? '/team-login' : '/login';
}

// ====================================================================
// MEMBERS
// ====================================================================
export interface MemberResponse {
  id: string;
  full_name: string;
  email?: string;
  phone_number: string;
  status?: string;
  subscription_status?: string;
  subscription_end_date?: string | null;
  subscription_start_date?: string | null;
  visit_count?: string | number;
  code?: string;
  plan_name?: string;
  join_date?: string;
  created_at?: string;
  birth_date?: string;
  gender?: string;
  last_checkin?: string;
  is_blacklisted?: boolean;
  blacklist_reason?: string;
  balance?: string;
}

export async function listMembers(params?: { search?: string; status?: string; page?: number; limit?: number; sort?: string; order?: string }) {
  const res = await api.get('/api/members', { params });
  return {
    members: (res.data.data || []) as MemberResponse[],
    total: (res.data.pagination?.total || 0) as number,
  };
}

// §34ح — the five stat cards above the members list. Every number comes from
// /api/members/stats; nothing here is derived client-side.
export interface MemberStats {
  total_members: number;
  active_members: number;
  ever_subscribed: number;
  new_this_month: number;
  present_now: number;
}

export async function getMemberStats(): Promise<MemberStats> {
  const res = await api.get('/api/members/stats');
  return res.data.data as MemberStats;
}

export async function getMember(id: string) {
  const res = await api.get(`/api/members/${id}`);
  return res.data.data || res.data;
}

export interface NewMemberInput {
  full_name: string;
  phone_number: string;
  email?: string;
  birth_date?: string;
  plan_id?: string;
  photo_url?: string;
  medical_notes?: string;
  gender?: string;
  card_code?: string;
  national_id?: string;
  emergency_phone?: string;
  address?: string;
  notes?: string;
  allowed_days?: string[];
  sales_rep_id?: string | null;
  offer_id?: string;
  coach_id?: string | null;
  sport?: string | null;
  start_date?: string;
  discount?: number;
  amount_paid?: number;
  payment_method?: string;
}

export async function createMember(data: NewMemberInput) {
  const res = await api.post('/api/members', data);
  return res.data as {
    success: boolean;
    data: any;
    generated_pin?: string;
    subscription?: { id: string; offer_title: string; start_date: string; end_date: string; due: number; paid: number; outstanding: number } | null;
  };
}

export async function blacklistMember(id: string, reason: string) {
  const res = await api.put(`/api/members/${id}/blacklist`, { reason });
  return res.data;
}

// توليد رمز دخول جديد (يُعرض مرة واحدة — لا يُسترجع بعدها).
export async function resetMemberPin(id: string): Promise<{ data: { pin: string } }> {
  const res = await api.post(`/api/members/${id}/pin-reset`);
  return res.data;
}

// §34ج — real member edit (the profile page's EDIT button was a fake toast;
// the PUT endpoint has existed server-side all along).
export async function updateMember(id: string, data: {
  full_name?: string;
  phone_number?: string;
  email?: string;
  birth_date?: string;
  photo_url?: string;
  medical_notes?: string;
  gender?: string | null;
  card_code?: string | null;
  national_id?: string | null;
  emergency_phone?: string | null;
  address?: string | null;
  notes?: string | null;
  allowed_days?: string[] | null;
  sales_rep_id?: string | null;
}) {
  const res = await api.put(`/api/members/${id}`, data);
  return res.data;
}

// ====================================================================
// §34ج — REAL CSV IMPORT (replaces the MigrationTab fake setTimeout import)
// The browser parses the CSV file into raw row objects and posts them; the
// server inserts every row and reports exactly what landed and what failed.
// ====================================================================
export type ImportType = 'members' | 'memberships' | 'attendance' | 'leads' | 'payments' | 'products';

export interface ImportResult {
  type: ImportType;
  imported: number;
  failed: number;
  errors: { row: number; message: string }[];
}

export async function importCsv(type: ImportType, rows: Record<string, string>[]): Promise<ImportResult> {
  const res = await api.post(`/api/import/${type}`, { rows });
  return res.data.data as ImportResult;
}

// ====================================================================
// ATTENDANCE
// ====================================================================
export async function qrCheckIn(qrData: string) {
  const res = await api.post('/api/attendance/qr', { qr_token: qrData });
  return res.data;
}

// Reception desk flow: check a member in by typed phone number
// (server /api/attendance/manual accepts member_phone OR member_id).
export async function manualCheckInByPhone(memberPhone: string) {
  const res = await api.post('/api/attendance/manual', { member_phone: memberPhone });
  return res.data;
}

// §35ب — check in by member UUID (resolved from the unified lookup field).
export async function manualCheckInById(memberId: string) {
  const res = await api.post('/api/attendance/manual', { member_id: memberId });
  return res.data;
}

// §35ب — candidate rows for the unified check-in field (name/phone/UUID).
export interface CheckInMemberHit {
  id: string;
  full_name: string;
  phone_number?: string | null;
  is_blacklisted?: boolean;
  sub_status?: string | null;
  card_code?: string | null;
}

export async function lookupMembersForCheckIn(q: string) {
  const res = await api.get('/api/attendance/lookup', { params: { q } });
  return (res.data?.data ?? []) as CheckInMemberHit[];
}

export async function getTodayAttendance(date?: string) {
  const res = await api.get('/api/attendance/today', { params: date ? { date } : undefined });
  return { records: (res.data.data || []) as Record<string, unknown>[] };
}

// §34ح — front desk closes an open session explicitly.
export async function checkOutAttendance(attendanceLogId: string) {
  const res = await api.post('/api/attendance/checkout', { attendance_log_id: attendanceLogId });
  return res.data;
}

// ====================================================================
// PENDING ACTIONS
// ====================================================================
export interface PendingAction {
  id: string;
  action_type: string;
  target_table: string;
  target_record_id: string;
  new_data_json: Record<string, unknown>;
  status: string;
  requested_by_staff_id?: string;
  created_at: string;
}

export async function listPendingActions(params?: { status?: string }) {
  const res = await api.get('/api/pending-actions', { params });
  return { actions: (res.data.data || res.data.actions || []) as PendingAction[] };
}

export async function createPendingAction(data: {
  action_type: string;
  target_table: string;
  target_record_id: string;
  new_data_json: Record<string, unknown>;
  reason: string;
}) {
  const res = await api.post('/api/pending-actions', data);
  return res.data;
}

export async function processPendingAction(id: string, decision: 'approved' | 'rejected') {
  const res = await api.put('/api/pending-actions/process', { action_id: id, decision });
  return res.data;
}

// ====================================================================
// CLASS BOOKINGS
// ====================================================================
export async function bookClass(data: { class_id: string }) {
  const res = await api.post('/api/classes/book', data);
  return res.data;
}

export async function cancelClassBooking(bookingId: string) {
  const res = await api.put(`/api/classes/cancel/${bookingId}`);
  return res.data;
}

export async function getMyBookings() {
  const res = await api.get('/api/classes/my-bookings');
  return res.data;
}

// ====================================================================
// SUBSCRIPTION FREEZE
// ====================================================================
export async function toggleFreeze(data: { subscription_id: string; freeze_days: number }) {
  const res = await api.post('/api/subscriptions/freeze', data);
  return res.data;
}

// ====================================================================
// MEMBERSHIP OFFERS
// ====================================================================
// ====================================================================
// NOTIFICATIONS
// ====================================================================
export interface NotificationItem {
  id: string;
  text: string;
  time: string;
  type?: string;
  read?: boolean;
}

export interface GymNotification {
  id: string;
  gym_id: string | null;
  recipient_role: string;
  notification_type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
  is_unread: boolean;
}

export async function getNotifications(): Promise<GymNotification[]> {
  const res = await api.get('/api/notifications');
  return res.data?.data ?? [];
}

export async function markGymNotificationRead(id: string): Promise<void> {
  await api.patch(`/api/notifications/${id}/read`);
}

export async function listOffers() {
  const res = await api.get('/api/membership-offers');
  return res.data;
}

// §33ب — membership_offers is the single source of truth for plans/offers.
export interface MembershipOffer {
  id: string;
  title: string;
  duration_days: number;
  price: number | string;
  is_active: boolean;
  subscription_count?: number;
  /** اشتراكات نشطة على الباقة (status='active'). */
  active_count?: number;
  /** إجمالي المحصّل من اشتراكات الباقة (SUM price_paid). */
  revenue?: number | string;
  /** الرياضة الغالبة بين اشتراكات الباقة — null = بدون تصنيف. */
  sport_mode?: string | null;
  /** تصنيف الباقة نفسها (يُدخَل من صفحة إضافة باقة) — null = بدون تصنيف. */
  sport?: string | null;
  /** الحصص — null = تلقائي (يساوي عدد الأيام، حصة/يوم). */
  total_sessions?: number | null;
  freeze_days_max?: number | null;
  weekly_days?: string[] | null;
  description?: string | null;
}

export interface OfferInput {
  title: string;
  duration_days: number;
  price: number;
  sport?: string | null;
  total_sessions?: number | null;
  freeze_days_max?: number;
  weekly_days?: string[] | null;
  description?: string | null;
}

export async function listOffersManage(): Promise<{ data: MembershipOffer[] }> {
  const res = await api.get('/api/membership-offers/manage');
  return res.data;
}

export async function createOffer(input: OfferInput): Promise<{ data: MembershipOffer }> {
  const res = await api.post('/api/membership-offers', input);
  return res.data;
}

export async function updateOffer(id: string, input: Partial<OfferInput & { is_active: boolean }>): Promise<{ data: MembershipOffer }> {
  const res = await api.put(`/api/membership-offers/${id}`, input);
  return res.data;
}

// حذف الباقة مسموح فقط بلا اشتراكات مرتبطة — السيرفر يرد 409 ومعه العدد.
export async function deleteOffer(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  const res = await api.delete(`/api/membership-offers/${id}`);
  return res.data;
}

// ====================================================================
// كتالوج الرياضات (gym_sports) — المرجع الحي بدل الـenum الثابت
// ====================================================================
export interface GymSport {
  id: string;
  code: string;
  name_ar: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  plan_count?: number;
  active_sub_count?: number;
}

export async function listSports(): Promise<{ data: GymSport[] }> {
  const res = await api.get('/api/sports');
  return res.data;
}

export async function createSport(input: { name_ar: string; icon?: string; color?: string; sort_order?: number }): Promise<{ data: GymSport }> {
  const res = await api.post('/api/sports', input);
  return res.data;
}

export async function updateSport(id: string, input: Partial<{ name_ar: string; icon: string; color: string; sort_order: number; is_active: boolean }>): Promise<{ data: GymSport }> {
  const res = await api.put(`/api/sports/${id}`, input);
  return res.data;
}

export async function deleteSport(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  const res = await api.delete(`/api/sports/${id}`);
  return res.data;
}

// ====================================================================
// الحصة السريعة (quick_sessions) — SKU مستقل بسعر ثابت، بلا اشتراك
// ====================================================================
export interface QuickSessionRow {
  id: string;
  client_name: string;
  member_name: string | null;
  session_name: string;
  price: number;
  paid: number;
  remaining: number;
  payment_method: string | null;
  session_time: string;
  attendance_logged: boolean;
  created_at: string;
  coach_name: string | null;
}

export interface QuickSessionStats {
  today_collected: number;
  today_remaining: number;
  month_collected: number;
}

export async function listQuickSessions(date?: string): Promise<{
  data: QuickSessionRow[];
  stats: QuickSessionStats;
  date: string;
  default_price: number;
}> {
  const res = await api.get('/api/quick-sessions', { params: date ? { date } : undefined });
  return res.data;
}

export async function createQuickSession(input: {
  member_id?: string | null;
  client_name?: string;
  session_name?: string;
  price: number;
  paid?: number;
  payment_method?: string;
  coach_id?: string | null;
  session_time?: string;
  with_attendance?: boolean;
}): Promise<{ data: QuickSessionRow & { coach_name: string | null } }> {
  const res = await api.post('/api/quick-sessions', input);
  return res.data;
}

// ====================================================================
// البرايفت (pt_enrollments) — منتج مستقل: عضو + مدرب + حصص + فلوس
// ====================================================================
export interface PtEnrollmentRow {
  id: string;
  member_id: string | null;
  coach_id: string | null;
  member_name: string | null;
  member_phone: string | null;
  coach_name: string | null;
  total_sessions: number;
  sessions_used: number;
  session_price: number | string;
  total_amount: number;
  paid_amount: number;
  remaining: number;
  start_date: string;
  end_date: string;
  status: string;
  derived_status: 'active' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
}

export async function listPtEnrollments(status?: string): Promise<{
  data: PtEnrollmentRow[];
  stats: { active_count: number; total_paid: number; total_debt: number; total_sessions: number };
  status: string;
}> {
  const res = await api.get('/api/pt-enrollments', { params: status ? { status } : undefined });
  return res.data;
}

export async function createPtEnrollment(input: {
  member_id: string;
  coach_id: string;
  total_sessions: number;
  session_price: number;
  start_date?: string;
  end_date?: string;
  amount_paid?: number;
  payment_method?: string;
  notes?: string;
}): Promise<{ data: { id: string; total: number; paid: number; remaining: number } }> {
  const res = await api.post('/api/pt-enrollments', input);
  return res.data;
}

export async function consumePtSession(id: string): Promise<{ data: { id: string; sessions_used: number; total_sessions: number; status: string } }> {
  const res = await api.post(`/api/pt-enrollments/${id}/consume`);
  return res.data;
}

export async function cancelPtEnrollment(id: string): Promise<{ data: { id: string; cancelled: boolean } }> {
  const res = await api.post(`/api/pt-enrollments/${id}/cancel`);
  return res.data;
}

export async function ptReport(): Promise<{
  data: { month: string; enrollments: number; collected: number; outstanding: number }[];
}> {
  const res = await api.get('/api/pt-enrollments/report');
  return res.data;
}

// ====================================================================
// §34ي — صفحة الاشتراكات: دفتر حقيقي على member_subscriptions
// ====================================================================
export interface SubscriptionRow {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  sport: string | null;
  weekly_days: string[] | null;
  price_paid: number | string;
  coach_id: string | null;
  coach_name: string | null;
  member_id: string;
  member_name: string;
  member_code: string | null;
  member_phone: string | null;
  offer_id: string;
  offer_title: string;
  duration_days: number;
  offer_price: number | string;
  remaining_days: number;
  payment_state: 'paid' | 'unpaid';
  outstanding_amount: number | string;
}

export interface SubscriptionsStats {
  active: number;
  ending_soon: number;
  unpaid: number;
  dues: number | string;
}

export async function listSubscriptions(params?: {
  status?: string; sport?: string; duration?: string; search?: string;
  member_id?: string; page?: number; limit?: number; sort?: string; order?: string;
}): Promise<{ data: SubscriptionRow[]; pagination: { page: number; limit: number; total: number; total_pages: number }; stats: SubscriptionsStats }> {
  const res = await api.get('/api/subscriptions', { params });
  return res.data;
}

export interface NewSubscriptionInput {
  member_id: string;
  offer_id: string;
  coach_id?: string | null;
  sport?: string | null;
  start_date: string; // YYYY-MM-DD
  end_date?: string;
  weekly_days?: string[];
  amount_paid: number;
  payment_method: 'cash' | 'card' | 'vodafone_cash' | 'instapay' | 'bank';
}

export async function createSubscription(input: NewSubscriptionInput): Promise<{ data: SubscriptionRow & { member_name: string; offer_title: string; outstanding_amount: number } }> {
  const res = await api.post('/api/subscriptions', input);
  return res.data;
}

export async function cancelSubscription(id: string, reason: string): Promise<{ data: unknown }> {
  const res = await api.post(`/api/subscriptions/${id}/cancel`, { reason });
  return res.data;
}

export interface UpdateSubscriptionInput {
  coach_id?: string | null;
  sport?: string | null;
  weekly_days?: string[] | null;
}

export async function updateSubscription(id: string, input: UpdateSubscriptionInput): Promise<{ data: { id: string; coach_id: string | null; sport: string | null; weekly_days: string[] | null } }> {
  const res = await api.put(`/api/subscriptions/${id}`, input);
  return res.data;
}

// ====================================================================
// CRM / LEAD MANAGEMENT
// ====================================================================
export interface LeadData {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: string;
  status: string;
  notes?: string;
  assigned_to?: string;
  created_at?: string;
}

export async function listLeads(params?: { search?: string; status?: string; source?: string; page?: number; limit?: number }) {
  const res = await api.get('/api/crm/leads', { params });
  return res.data as { data: LeadData[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
}

export async function createLead(data: { name: string; phone: string; email?: string; source?: string; notes?: string; assigned_to?: string }) {
  const res = await api.post('/api/crm/leads', data);
  return res.data as { success: boolean; data: LeadData };
}

export async function updateLead(id: string, data: Partial<LeadData>) {
  const res = await api.put(`/api/crm/leads/${id}`, data);
  return res.data as { success: boolean; data: LeadData };
}

export async function deleteLead(id: string) {
  const res = await api.delete(`/api/crm/leads/${id}`);
  return res.data as { success: boolean };
}

export async function getLeadStats() {
  const res = await api.get('/api/crm/leads/stats');
  return res.data as { data: { status: string; count: number }[] };
}

// ====================================================================
// CUSTOMER 360
// ====================================================================
export interface Customer360Data {
  member: Record<string, unknown>;
  subscriptions: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  loyalty: { points_balance: number; tier: string };
  stats: { total_checkins: number; checkins_30d: number; checkins_7d: number; last_checkin: string };
}

export async function getCustomer360(memberId: string) {
  const res = await api.get(`/api/customer360/${memberId}`);
  return res.data as { data: Customer360Data };
}

export async function searchMembers(query: string) {
  const res = await api.get('/api/customer360/search', { params: { q: query } });
  return res.data as { data: { id: string; full_name: string; phone_number: string }[] };
}

// ====================================================================
// MEMBER-SPECIFIC ENDPOINTS (for Athlete / Player dashboards)
// ====================================================================
export interface MyProfileData {
  id: string;
  full_name: string;
  phone_number: string;
  email?: string;
  photo_url?: string;
  gym_id: string;
}

export async function getMyProfile() {
  const res = await api.get('/api/members/me');
  return res.data as { data: MyProfileData };
}

export async function getMyVisits() {
  const res = await api.get('/api/attendance/my-visits');
  return res.data as { data: Record<string, unknown>[] };
}

export interface MySubscriptionData {
  id: string;
  plan_id: string;
  plan_name: string;
  status: string;
  start_date: string;
  end_date: string;
  price_paid?: number;
}

export async function getMySubscription() {
  const res = await api.get('/api/subscriptions/my');
  return res.data as { data: MySubscriptionData | null };
}

export interface MyPointsData {
  points_balance: number;
  tier: string;
}

export async function getMyPoints() {
  const res = await api.get('/api/loyalty/my-points');
  return res.data as { data: MyPointsData };
}

export interface UpcomingClassData {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  capacity: number;
  trainer_name: string;
  booked: number;
}

export async function getUpcomingClasses() {
  const res = await api.get('/api/classes/upcoming');
  return res.data as { data: UpcomingClassData[] };
}

// ====================================================================
// §37ب — CLASS SCHEDULE (gym-manager CRUD over fitness_classes)
// One class = one dated occurrence (start/end timestamptz). The weekly
// grid fetches its visible range — no client-side re-labelling.
// ====================================================================
export interface GymClassData {
  id: string;
  title: string;
  coach_id: string;
  coach_name: string | null;
  capacity: number;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
  booked: number;
}

export interface GymClassInput {
  title: string;
  coach_id: string;
  capacity: number;
  start_time: string;
  end_time: string;
}

export async function listGymClasses(from: string, to: string) {
  const res = await api.get('/api/classes', { params: { from, to } });
  return res.data as { data: GymClassData[] };
}

export async function createGymClass(input: GymClassInput) {
  const res = await api.post('/api/classes', input);
  return res.data as { data: GymClassData };
}

export async function updateGymClass(id: string, input: Partial<GymClassInput> & { is_cancelled?: boolean }) {
  const res = await api.put(`/api/classes/${id}`, input);
  return res.data as { data: GymClassData };
}

export async function deleteGymClass(id: string) {
  const res = await api.delete(`/api/classes/${id}`);
  return res.data as { success: boolean };
}

// ====================================================================
// PRODUCTS
// ====================================================================
export interface ProductData {
  id: string;
  name: string; barcode?: string;
  stock_quantity: number; min_stock?: number; purchase_price: number; selling_price: number;
}
export async function listProducts(search?: string) {
  const res = await api.get('/api/products', { params: { search } });
  return res.data as { data: ProductData[] };
}
export async function getProduct(id: string) {
  const res = await api.get(`/api/products/${id}`);
  return res.data as { data: ProductData };
}
export async function createProduct(data: { name: string; barcode?: string; stock_quantity?: number; min_stock?: number; purchase_price: number; selling_price: number }) {
  const res = await api.post('/api/products', data);
  return res.data as { data: ProductData };
}
export async function updateProduct(id: string, data: Partial<ProductData>) {
  const res = await api.put(`/api/products/${id}`, data);
  return res.data as { data: ProductData };
}
export async function deleteProduct(id: string) {
  const res = await api.delete(`/api/products/${id}`);
  return res.data as { success: boolean };
}

// ====================================================================
// FINANCE — Payments, Expenses, Sales, Purchases, Suppliers, Debts, Cashbox
// ====================================================================
// §43 — opts accepts the payments-screen filters (ISO dates + method).
// Passing a plain page number (BillingOverview) stays supported unchanged.
export async function listPayments(opts?: number | { page?: number; limit?: number; from?: string; to?: string; method?: string }) {
  const params = typeof opts === 'number' ? { page: opts, limit: 20 } : opts;
  const res = await api.get('/api/finance/payments', { params });
  return res.data as { data: any[]; pagination: any; stats?: any };
}
export async function createPayment(data: { member_id: string; amount: number; description?: string; payment_method?: string }) {
  const res = await api.post('/api/finance/payments', data);
  return res.data as { data: any };
}
// §34ث — expenses now carry honest server-side totals (sum of all + this month),
// so pages must not re-add rows client-side.
// §44 — opts accepts the expenses-screen date range (ISO) + paging; calling
// with no arguments keeps the old behavior (server defaults: current month).
export async function listExpenses(opts?: { page?: number; limit?: number; from?: string; to?: string }) {
  const res = await api.get('/api/finance/expenses', { params: opts });
  return res.data as { data: any[]; pagination?: any; stats?: any };
}
export async function createExpense(data: { amount: number; description?: string; category_id?: string | null; payment_method?: string; date?: string }) {
  const res = await api.post('/api/finance/expenses', data);
  return res.data as { data: any };
}
export async function listExpenseCategories() {
  const res = await api.get('/api/finance/expense-categories');
  return res.data as { data: any[] };
}
export async function listSales(page?: number) {
  const res = await api.get('/api/finance/sales', { params: { page, limit: 20 } });
  return res.data as { data: any[]; pagination: any };
}
export async function createSale(data: { member_id?: string | null; items: { product_id: string; quantity: number }[]; payment_method?: string }) {
  const res = await api.post('/api/finance/sales', data);
  return res.data as { data: any };
}
export async function listPurchases() {
  const res = await api.get('/api/finance/purchases');
  return res.data as { data: any[] };
}
export async function createPurchase(data: { supplier_id?: string | null; items: { product_id: string; quantity: number; unit_price: number }[]; payment_method?: string; notes?: string }) {
  const res = await api.post('/api/finance/purchases', data);
  return res.data as { data: any };
}
export async function listSuppliers() {
  const res = await api.get('/api/finance/suppliers');
  return res.data as { data: any[] };
}
export async function createSupplier(data: { name: string; phone?: string; email?: string; address?: string; notes?: string }) {
  const res = await api.post('/api/finance/suppliers', data);
  return res.data as { data: any };
}
// §45 — debts screen: q/kind/status/page go to the server (search matches
// decrypted phone); response carries derived debt_kind/payment_status,
// per-row paid_amount and the four honest card aggregates.
export async function listDebts(opts?: { q?: string; kind?: string; status?: string; page?: number; limit?: number }) {
  const res = await api.get('/api/finance/debts', {
    params: {
      q: opts?.q || undefined,
      kind: opts?.kind && opts.kind !== 'all' ? opts.kind : undefined,
      status: opts?.status && opts.status !== 'all' ? opts.status : undefined,
      page: opts?.page,
      limit: opts?.limit,
    },
  });
  return res.data as {
    data: any[];
    pagination?: any;
    stats?: { total_due: string | number; subscription_due: string | number; sale_due: string | number; debt_count: number };
  };
}
export async function createDebt(data: { member_id: string; amount: number; due_date: string; reason?: string }) {
  const res = await api.post('/api/finance/debts', data);
  return res.data as { data: any };
}
// §45 — partial payment is official: amount may be less than the remaining;
// the server books a real payment row and returns the new remaining.
export async function payDebt(id: string, amount: number, note?: string) {
  const res = await api.post(`/api/finance/debts/${id}/pay`, { amount, note });
  return res.data as { success: boolean; paid: number; remaining: number; status: string };
}
// §34ث — shift rows now include reconciliation figures computed server-side
// from the ledger (cash attributed to the OPEN shift while it runs).
// + shift_no (historical serial), income/expense totals and per-method buckets.
export interface CashboxSessionRow {
  id: string;
  staff_user_id?: string | null;
  shift_no?: number;
  staff_name?: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_balance: string | number;
  closing_balance: string | number | null;
  status: 'open' | 'closed';
  notes?: string | null;
  cash_in: string | number;
  cash_out: string | number;
  refunds?: string | number;
  income_total?: string | number;
  m_cash?: string | number;
  m_visa?: string | number;
  m_wallet?: string | number;
  m_instapay?: string | number;
  expense_total?: string | number;
  expected_balance: string | number;
  difference: string | number | null;
}
export async function listCashboxSessions(params?: { from?: string; to?: string; staff_id?: string }) {
  const res = await api.get('/api/finance/cashbox', { params });
  return res.data as { data: CashboxSessionRow[] };
}
export interface ShiftReport {
  session: CashboxSessionRow;
  ops: {
    subs_count: number; subs_sum: string | number;
    sales_count: number; sales_sum: string | number;
    gen_exp_count: number; gen_exp_sum: string | number;
    refund_count: number; refund_sum: string | number;
  };
  salaries: { pay_count: number; pay_sum: string | number };
}
export async function getShiftReport(id: string): Promise<{ data: ShiftReport }> {
  const res = await api.get(`/api/finance/cashbox/${id}/report`);
  return res.data;
}
export interface CashLedgerRow {
  id: string;
  type: 'payment' | 'expense' | 'refund';
  amount: string | number;
  description: string | null;
  payment_method: string | null;
  created_at: string;
  party: string | null;
}
export async function getCashSessionLedger(id: string) {
  const res = await api.get(`/api/finance/cashbox/${id}/ledger`);
  return res.data as { data: { session: CashboxSessionRow; rows: CashLedgerRow[] } };
}
export interface CashbookDay {
  date: string;
  cash_in: string | number;
  cash_out: string | number;
  refunds: string | number;
  net: string | number;
}
export async function getCashbook(days: number) {
  const res = await api.get('/api/finance/cashbook', { params: { days } });
  return res.data as { data: { days: number; timezone: string; rows: CashbookDay[]; totals: { cash_in: string | number; cash_out: string | number; refunds: string | number; net: string | number } } };
}
export async function openCashbox(opening_balance?: number, notes?: string) {
  const res = await api.post('/api/finance/cashbox/open', { opening_balance, notes });
  return res.data as { data: any };
}
export async function closeCashbox(id: string, closing_balance: number, notes?: string) {
  const res = await api.post('/api/finance/cashbox/close', { id, closing_balance, notes });
  return res.data as { data: any };
}
// §34ث — monthly_sales (an order COUNT shown as money) is gone: sum and count
// travel separately, plus net_month and the gym timezone for honest labels.
export interface ReportsOverview {
  from: string;
  to: string;
  timezone: string;
  days: number;
  kpis: {
    active_members: number;
    new_members: number;
    active_subscriptions: number;
    attendance_total: number;
    attendance_daily_avg: number;
    unpaid_period: number;
    outstanding_total: number;
    revenue: number;
    expenses: number;
    net_profit: number;
  };
  daily_revenue: { date: string; amount: number }[];
  packages: { key: string; count: number }[];
  top_attendance: { member_id: string; full_name: string; card_code: string | null; visits: number }[];
}

/** Aggregated reports dashboard — every figure uses the same gym-local from/to. */
export async function getReportsOverview(from: string, to: string) {
  const res = await api.get('/api/reports/overview', { params: { from, to } });
  return res.data as { data: ReportsOverview };
}

export interface MembersReportRow {
  id: string;
  full_name: string;
  card_code: string | null;
  phone_number: string | null;
  gender: string | null;
  subs_count: number;
  visits: number;
  active_end_date: string | null;
  is_blacklisted: boolean;
}

export interface MembersReportStats {
  total: number;
  males: number;
  females: number;
  with_active: number;
}

/** Members report — strict filters (status/gender/subscription), rejected when unknown. */
export async function getMembersReport(params?: {
  status?: string; gender?: string; subscription?: string;
  page?: number; limit?: number; sort?: string; order?: string;
}): Promise<{
  data: MembersReportRow[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  stats: MembersReportStats;
}> {
  const res = await api.get('/api/reports/members', { params });
  return res.data;
}

export interface FinancialReport {
  from: string;
  to: string;
  timezone: string;
  totals: {
    revenue: number; revenue_count: number;
    expenses: number; expenses_count: number;
    net: number;
  };
  daily: { date: string; revenue: number; expenses: number }[];
  methods: { method: string; count: number; total: number }[];
  recent_income: { amount: number; payment_method: string | null; member_name: string | null; created_at: string }[];
  recent_expenses: { amount: number; description: string | null; created_at: string }[];
}

/** Financial report — same ledger as the cashbox, accounting view. */
export async function getFinancialReport(from: string, to: string): Promise<{ data: FinancialReport }> {
  const res = await api.get('/api/reports/financial', { params: { from, to } });
  return res.data;
}

export interface AttendanceLogRow {
  check_in_time: string;
  check_out_time: string | null;
  full_name: string;
  card_code: string | null;
  duration_min: number | null;
}

export interface AttendanceReport {
  from: string;
  to: string;
  timezone: string;
  days: number;
  kpis: {
    total: number;
    unique_members: number;
    daily_avg: number;
    present_now: number;
  };
  daily: { date: string; count: number }[];
  hours: { hour: number; count: number }[];
  log: {
    rows: AttendanceLogRow[];
    pagination: { page: number; limit: number; total: number; total_pages: number };
  };
}

/** Attendance report — 4 layers from the same attendance_logs as the day log. */
export async function getAttendanceReport(params: {
  from: string; to: string; page?: number; limit?: number; sort?: string; order?: string;
}): Promise<{ data: AttendanceReport }> {
  const res = await api.get('/api/reports/attendance', { params });
  return res.data;
}

export interface SubscriptionsReportRow {
  id: string;
  member_name: string;
  card_code: string | null;
  phone_number: string | null;
  offer_title: string;
  start_date: string;
  end_date: string;
  price: number;
  price_paid: number;
  status: string;
}

export interface SubscriptionsReportStats {
  total: number;
  full_paid: number;
  partial: number;
  remaining: number;
}

/** Subscriptions report — same status definitions as the subscriptions page. */
export async function getSubscriptionsReport(params?: {
  status?: string; offer_id?: string; date_field?: string; from?: string; to?: string;
  page?: number; limit?: number; sort?: string; order?: string;
}): Promise<{
  data: SubscriptionsReportRow[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  stats: SubscriptionsReportStats;
}> {
  const res = await api.get('/api/reports/subscriptions', { params });
  return res.data;
}

export interface AbsentMemberRow {
  id: string;
  full_name: string;
  card_code: string | null;
  phone_number: string | null;
  plan_name: string | null;
  sub_end: string | null;
  last_visit: string | null;
  days_absent: number;
  has_active: boolean;
}

export interface AbsentReportStats {
  total: number;
  week_or_less: number;
  mid: number;
  over_month: number;
}

/** Absent members — rescue list ordered by longest absence. */
export async function getAbsentReport(params?: {
  days_min?: number; page?: number; limit?: number; sort?: string; order?: string;
}): Promise<{
  data: AbsentMemberRow[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  stats: AbsentReportStats;
}> {
  const res = await api.get('/api/reports/absent', { params });
  return res.data;
}

export interface EmployeeSaleRow {
  staff_id: string | null;
  staff_name: string | null;
  rate: number;
  new_count: number;
  renew_count: number;
  total_count: number;
  sale_value: number;
  collected: number;
  commission: number;
}

export interface EmployeeSalesTotals {
  total_count: number;
  new_count: number;
  renew_count: number;
  sale_value: number;
  collected: number;
  commission: number;
}

/** Employee sales — new/renewal split, value vs collected, commission at current rate. */
export async function getEmployeeSalesReport(from: string, to: string): Promise<{
  data: { from: string; to: string; timezone: string; staff: EmployeeSaleRow[]; totals: EmployeeSalesTotals };
}> {
  const res = await api.get('/api/reports/employee-sales', { params: { from, to } });
  return res.data;
}

export interface AlertsCenter {
  expiring_days: number;
  counts: { today: number; soon: number; unpaid: number; low_stock: number; total: number };
  expiring_today: { member_id: string; member_name: string; phone_number: string | null; end_date: string }[];
  expiring_soon: { member_id: string; member_name: string; phone_number: string | null; end_date: string; days_left: number }[];
  unpaid: {
    id: string; member_id: string; member_name: string; phone_number: string | null;
    original_amount: number; paid_amount: number; remaining_amount: number;
  }[];
  low_stock: { id: string; name: string; stock_quantity: number; min_stock: number }[];
}

/** Alerts center — same count source as the sidebar badge. */
export async function getAlertsCenter(): Promise<{ data: AlertsCenter }> {
  const res = await api.get('/api/notifications/center');
  return res.data;
}

export async function getFinanceSummary() {
  const res = await api.get('/api/finance/summary');
  return res.data as { data: { monthly_revenue: string | number; monthly_expenses: string | number; monthly_refunds?: string | number; outstanding_debts: string | number; monthly_sales_sum: string | number; monthly_sales_count: number; net_month: number; today_revenue: string | number; yesterday_revenue: string | number; today_sales_sum?: string | number; today_sales_count?: number; today_payment_count?: number; today_expense_sum?: string | number; today_expense_count?: number; today_refund_sum?: string | number; today_refund_count?: number; timezone?: string } };
}

export interface CashMovement {
  id: string;
  type: 'payment' | 'expense' | 'refund';
  amount: string | number;
  description: string | null;
  payment_method: string | null;
  member_name: string | null;
  created_at: string;
}

export async function listMovements(params?: {
  from?: string; to?: string; search?: string; type?: string; limit?: number;
}): Promise<{
  data: CashMovement[];
  stats: { count: number; in_sum: number; out_sum: number; refund_sum: number };
}> {
  const res = await api.get('/api/finance/movements', { params });
  return res.data;
}

export async function createRefund(input: {
  member_id?: string | null; amount: number; description: string; payment_method?: string;
}): Promise<{ data: CashMovement }> {
  const res = await api.post('/api/finance/refunds', input);
  return res.data;
}

// ====================================================================
// MANAGER DASHBOARD — "needs your action" feeds (§24, read-only)
// ====================================================================
export interface ExpiringSoonRow {
  member_id: string;
  member_name: string;
  end_date: string;
  days_left: number;
  price_paid: number;
}
export interface InactiveMemberRow {
  member_id: string;
  member_name: string;
  last_check_in: string | null;
  days_since: number;
}
export interface OverdueDebtRow {
  id: string;
  member_id: string;
  member_name: string;
  remaining_amount: number;
  due_date: string;
  days_overdue: number;
}

export async function getExpiringSoon(days = 7) {
  const res = await api.get('/api/dashboard/expiring-soon', { params: { days } });
  return res.data as { data: ExpiringSoonRow[]; total: number; days: number };
}
export async function getInactiveMembers(days = 14) {
  const res = await api.get('/api/dashboard/inactive-members', { params: { days } });
  return res.data as { data: InactiveMemberRow[]; total: number; days: number };
}
export async function getOverdueDebts() {
  const res = await api.get('/api/dashboard/overdue-debts');
  return res.data as { data: OverdueDebtRow[]; total_amount: number };
}

// §35أ — live sidebar badges (attendance/present-now, active debts, expiring
// subscriptions within 7 days, unread notifications). Single cheap read call.
export interface NavBadges {
  attendance: number;
  payments: number;
  alerts: number;
  messages: number;
}
export async function getNavBadges(): Promise<NavBadges> {
  const res = await api.get('/api/nav/badges');
  return (res.data?.data ?? { attendance: 0, payments: 0, alerts: 0, messages: 0 }) as NavBadges;
}

// ====================================================================
// STAFF / USERS / TRAINERS
// ====================================================================
export interface StaffData {
  id: string; full_name: string; email: string; role: string;
  phone?: string; salary?: number; commission_pct?: number | string | null;
  is_active: boolean; created_at: string;
  employee_code?: string | null;
  department?: string | null;
  job_title?: string | null;
  national_id?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  address?: string | null;
  hire_date?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  late_allowance_min?: number | null;
  weekly_off?: string[] | null;
  housing_allowance?: number | string | null;
  transport_allowance?: number | string | null;
  other_allowance?: number | string | null;
  annual_leave_days?: number | string | null;
  sick_leave_days?: number | string | null;
  monthly_leave_days?: number | string | null;
}
export async function listStaff() {
  const res = await api.get('/api/staff');
  return res.data as { data: StaffData[] };
}
export async function getStaff(id: string) {
  const res = await api.get(`/api/staff/${id}`);
  return res.data as { data: StaffData };
}
export async function createStaff(data: { full_name: string; email: string; password: string; role: string; phone?: string; salary?: number; commission_pct?: number; pin?: string; department?: string | null; job_title?: string | null; national_id?: string | null; birth_date?: string | null; gender?: string | null; address?: string | null; hire_date?: string | null; shift_start?: string | null; shift_end?: string | null; late_allowance_min?: number; weekly_off?: string[] | null; housing_allowance?: number; transport_allowance?: number; other_allowance?: number; annual_leave_days?: number; sick_leave_days?: number; monthly_leave_days?: number }) {
  const res = await api.post('/api/staff', data);
  return res.data as { data: StaffData };
}
export async function updateStaff(id: string, data: Partial<StaffData> & { pin?: string }) {
  const res = await api.put(`/api/staff/${id}`, data);
  return res.data as { data: StaffData };
}
export async function deleteStaff(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  const res = await api.delete(`/api/staff/${id}`);
  return res.data;
}
export async function listTrainers() {
  const res = await api.get('/api/trainers');
  return res.data as { data: StaffData[] };
}

// ملخص المدربين لصفحة /admin/trainers: حمل الاشتراكات النشطة + متواجد
// الآن (شيفت مفتوح) + الرياضة الغالبة — من نفس الدفاتر الحية.
export interface CoachSummary {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  salary: number | string | null;
  commission_pct: number | string;
  is_active: boolean;
  created_at: string;
  sub_count: number;
  on_shift: boolean;
  sport_mode: string | null;
}

export async function listCoachesSummary(): Promise<{ data: CoachSummary[] }> {
  const res = await api.get('/api/staff/coaches/summary');
  return res.data;
}

// ====================================================================
// شئون الموظفين (HR)
// ====================================================================
export interface LeaveRow {
  id: string;
  staff_user_id: string | null;
  staff_name: string | null;
  employee_code: string | null;
  leave_type: 'annual' | 'sick' | 'unpaid';
  start_date: string;
  end_date: string;
  days: number;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
}

export async function listLeaves(params?: { status?: string; q?: string }): Promise<{ data: LeaveRow[] }> {
  const res = await api.get('/api/hr/leaves', { params });
  return res.data;
}

export async function requestLeave(input: { staff_user_id: string; leave_type: string; start_date: string; end_date: string; notes?: string }): Promise<{ data: LeaveRow }> {
  const res = await api.post('/api/hr/leaves', input);
  return res.data;
}

export async function decideLeave(id: string, approve: boolean): Promise<{ data: { id: string; status: string } }> {
  const res = await api.post(`/api/hr/leaves/${id}/decision`, { approve });
  return res.data;
}

export async function leaveBalances(month?: string): Promise<{
  data: { staff_id: string; full_name: string; employee_code: string | null; monthly_allowance: number; monthly_used: number; monthly_left: number; annual_left: number; sick_left: number }[];
  month: string;
}> {
  const res = await api.get('/api/hr/leave-balances', { params: month ? { month } : undefined });
  return res.data;
}

export interface AdjustmentRow {
  id: string;
  staff_user_id: string | null;
  staff_name: string | null;
  employee_code: string | null;
  kind: 'bonus' | 'deduction' | 'advance';
  amount: number;
  repaid: number;
  outstanding: number;
  installment: number | null;
  month: string;
  reason: string | null;
  created_at: string;
}

export async function listAdjustments(params?: { month?: string; kind?: string; q?: string }): Promise<{
  data: AdjustmentRow[];
  stats: { bonus: number; deductions: number; advances: number };
  month: string;
}> {
  const res = await api.get('/api/hr/adjustments', { params });
  return res.data;
}

export async function createAdjustment(input: { staff_user_id: string; kind: string; amount: number; installment?: number | null; month: string; reason?: string }): Promise<{ data: AdjustmentRow }> {
  const res = await api.post('/api/hr/adjustments', input);
  return res.data;
}

export async function deleteAdjustment(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  const res = await api.delete(`/api/hr/adjustments/${id}`);
  return res.data;
}

export async function repayAdvance(id: string, amount: number): Promise<{ data: any }> {
  const res = await api.post(`/api/hr/adjustments/${id}/repay`, { amount });
  return res.data;
}

export interface PayrollItem {
  id: string;
  staff_user_id: string | null;
  staff_name: string;
  base: number;
  allowances: number;
  bonus: number;
  deductions: number;
  advance_deduction: number;
  net: number;
  status: string;
}

export async function generatePayroll(month: string): Promise<{ data: { id: string; month: string; total_net: number } }> {
  const res = await api.post('/api/hr/payroll/generate', { month });
  return res.data;
}

export async function getPayroll(month?: string): Promise<{
  data: null | {
    id: string; month: string; status: string; total_net: number;
    items: PayrollItem[]; paid_sum: number; paid_count: number;
    approved_at: string | null; paid_at: string | null;
  };
  month: string;
}> {
  const res = await api.get('/api/hr/payroll', { params: month ? { month } : undefined });
  return res.data;
}

export async function approvePayroll(id: string): Promise<{ data: { id: string; status: string } }> {
  const res = await api.post(`/api/hr/payroll/${id}/approve`);
  return res.data;
}

export async function payPayroll(id: string, paymentMethod?: string): Promise<{ data: { id: string; status: string; total: number } }> {
  const res = await api.post(`/api/hr/payroll/${id}/pay`, paymentMethod ? { payment_method: paymentMethod } : {});
  return res.data;
}

export async function deletePayrollRun(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  const res = await api.delete(`/api/hr/payroll/${id}`);
  return res.data;
}

export interface StaffContract {
  id: string;
  staff_user_id: string | null;
  staff_name: string | null;
  employee_code: string | null;
  contract_no: string;
  contract_type: string;
  start_date: string;
  end_date: string | null;
  salary: number;
  status: 'active' | 'expired';
  notes: string | null;
  created_at: string;
}

export async function listHrContracts(params?: { q?: string; status?: string; expiring?: boolean }): Promise<{ data: StaffContract[] }> {
  const res = await api.get('/api/hr/contracts', { params });
  return res.data;
}

export async function createHrContract(input: { staff_user_id: string; contract_type?: string; start_date: string; end_date?: string | null; salary: number; notes?: string }): Promise<{ data: StaffContract }> {
  const res = await api.post('/api/hr/contracts', input);
  return res.data;
}

export async function deleteHrContract(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  const res = await api.delete(`/api/hr/contracts/${id}`);
  return res.data;
}

export interface HrAttendanceRow {
  staff_id: string;
  full_name: string;
  employee_code: string | null;
  job_title: string | null;
  department: string | null;
  shift_start: string | null;
  late_allowance_min: number | null;
  saved_status: string | null;
  saved_note: string | null;
  clock_in: string | null;
  clock_out: string | null;
  suggested: string | null;
}

export async function getHrAttendance(date?: string): Promise<{
  data: HrAttendanceRow[];
  stats: { total: number; present: number; late: number; absent: number };
  date: string;
}> {
  const res = await api.get('/api/hr/attendance', { params: date ? { date } : undefined });
  return res.data;
}

export async function saveHrAttendance(date: string, rows: { staff_user_id: string; status: string; note?: string }[]): Promise<{ data: { date: string; saved: number } }> {
  const res = await api.post('/api/hr/attendance', { date, rows });
  return res.data;
}

export async function selfCheckin(staffId: string, pin: string): Promise<{ data: any }> {
  const res = await api.post('/api/staff/self-checkin', { staff_id: staffId, pin });
  return res.data;
}

// ====================================================================
// SHIFTS
// ====================================================================
export async function listShifts() {
  const res = await api.get('/api/staff/shifts');
  return res.data as { data: any[] };
}
export async function clockIn(staffId?: string, opts?: { clock_in?: string | null; note?: string }) {
  const res = await api.post('/api/staff/clock-in', { ...(staffId ? { staff_user_id: staffId } : {}), ...(opts ?? {}) });
  return res.data as { data: any };
}
export async function bulkClockInCoaches(coachIds?: string[]): Promise<{ data: { count: number; coaches: string[] } }> {
  const res = await api.post('/api/staff/clock-in-bulk', coachIds?.length ? { coach_ids: coachIds } : {});
  return res.data;
}
export async function updateShift(id: string, input: { clock_in?: string | null; clock_out?: string | null }) {
  const res = await api.put(`/api/staff/shifts/${id}`, input);
  return res.data as { data: any };
}

export interface CoachAttendanceRow {
  shift_id: string;
  staff_id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  clock_in: string;
  clock_out: string | null;
  duration_min: number | null;
  sport_mode: string | null;
}

export async function listCoachAttendance(params?: { date?: string; coach_id?: string }): Promise<{
  data: CoachAttendanceRow[];
  stats: { total: number; present: number; now_present: number; absent: number };
  date: string;
}> {
  const res = await api.get('/api/staff/coaches/attendance', { params });
  return res.data;
}

export async function coachAttendanceReport(month?: string, coachId?: string): Promise<{
  data: { id: string; full_name: string; days_present: number; total_min: number; earliest_in: string | null; latest_out: string | null; sport_mode: string | null; attendance_pct: number }[];
  month: string;
  working_days: number;
}> {
  const res = await api.get('/api/staff/coaches/attendance-report', {
    params: { ...(month ? { month } : {}), ...(coachId ? { coach_id: coachId } : {}) },
  });
  return res.data;
}
export async function clockOut() {
  const res = await api.post('/api/staff/clock-out');
  return res.data as { data: any };
}

// ====================================================================
// HR / PAYROLL
// ====================================================================
export async function listPayroll() {
  const res = await api.get('/api/hr/payroll');
  return res.data as { data: any[] };
}
export async function processPayroll(data: { staff_user_id: string; base_salary_paid?: number; commissions_paid?: number }) {
  const res = await api.post('/api/hr/payroll', data);
  return res.data as { data: any };
}
export async function getStaffAttendanceSummary() {
  const res = await api.get('/api/hr/staff-attendance');
  return res.data as { data: any[] };
}

// ====================================================================
// TRAINING — PT Packages & Sessions
// ====================================================================
export async function listPtPackages() {
  const res = await api.get('/api/training/packages');
  return res.data as { data: any[] };
}
export async function createPtPackage(data: { name: string; session_count: number; total_price: number }) {
  const res = await api.post('/api/training/packages', data);
  return res.data as { data: any };
}
export async function listPtSessions(params?: { member_id?: string; trainer_id?: string; mine?: boolean }) {
  const res = await api.get('/api/training/sessions', { params });
  return res.data as { data: any[] };
}
export async function createPtSession(data: { package_id: string; member_id: string; trainer_id: string; session_number: number; scheduled_at?: string | null }) {
  const res = await api.post('/api/training/sessions', data);
  return res.data as { data: any };
}
export async function completePtSession(id: string, notes?: string) {
  const res = await api.put(`/api/training/sessions/${id}/complete`, { notes });
  return res.data as { data: any };
}

// ====================================================================
// ANNOUNCEMENTS
// ====================================================================
export async function listAnnouncements() {
  const res = await api.get('/api/announcements');
  return res.data as { data: any[] };
}
export async function createAnnouncement(data: { title: string; content: string; target_audience?: string; is_pinned?: boolean }) {
  const res = await api.post('/api/announcements', data);
  return res.data as { data: any };
}

// ====================================================================
// SETTINGS
// ====================================================================
export async function getSettings() {
  const res = await api.get('/api/settings');
  return res.data as { data: Record<string, string> };
}
export async function updateSettings(settings: Record<string, string>) {
  const res = await api.put('/api/settings', settings);
  return res.data as { success: boolean };
}

// ====================================================================
// SETUP PROGRESS
// ====================================================================
export async function getSetupProgress(): Promise<Record<string, boolean>> {
  const res = await api.get('/api/setup/progress');
  return res.data?.data ?? {};
}

// ====================================================================
// PLATFORM ADMIN — Audit Logs
// ====================================================================
export interface AuditLogEntry {
  id: string;
  tenantId: string;
  tenantName: string;
  actionType: string;
  ipAddress: string;
  timestamp: string;
  user: string;
}

export async function listAuditLogs(params?: { search?: string; date?: string; limit?: number }): Promise<{ data: AuditLogEntry[] }> {
  const res = await api.get('/platform/audit-logs', { params });
  return res.data;
}

export interface SystemMetricItem {
  label: string;
  usage: number;
  icon: string;
  color: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
}

export interface SystemEvent {
  id: string;
  message: string;
  type: string;
  timestamp: string;
}

export interface DatabaseInfo {
  total_gyms: number;
  active_gyms: number;
  total_members: number;
  active_members: number;
  total_staff: number;
  active_subscriptions: number;
  checkins_24h: number;
  failed_logins_24h: number;
  pool_total: number;
  pool_idle: number;
  pool_active: number;
  pool_waiting: number;
}

export interface ServerInfo {
  hostname: string;
  platform: string;
  arch: string;
  node_version: string;
  uptime: string;
  uptime_seconds: number;
  total_mem_gb: number;
  free_mem_gb: number;
  mem_usage_percent: number;
  cpu_count: number;
  cpu_model: string;
  load_avg: number[];
  storage_used_mb: number;
}

export interface DailyCheckin {
  date: string;
  count: number;
}

export interface SystemMetrics {
  metrics: SystemMetricItem[];
  events: SystemEvent[];
  database: DatabaseInfo;
  server: ServerInfo;
  daily_checkins: DailyCheckin[];
  recent_errors: { message: string; timestamp: string }[];
}

export async function getSystemStatus(): Promise<{ data: SystemMetrics }> {
  const res = await api.get('/platform/system-status');
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — Support Tickets
// ====================================================================
export interface TicketData {
  id: string; gym_id: string; gym_name: string; subject: string; description: string;
  status: string; priority: string; assigned_email?: string; created_at: string;
}

export async function listTickets(params?: { status?: string | undefined; limit?: number }): Promise<{ data: TicketData[] }> {
  const res = await api.get('/platform/tickets', { params });
  return res.data;
}

export async function updateTicketStatus(id: string, status: string): Promise<{ data: TicketData }> {
  const res = await api.patch(`/platform/tickets/${id}/status`, { status });
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — Broadcasts
// ====================================================================
export interface BroadcastData {
  id: string; title: string; content: string; target_roles: string[];
  sent_by_email?: string; created_at: string;
}

export async function listBroadcasts(): Promise<{ data: BroadcastData[] }> {
  const res = await api.get('/platform/broadcasts');
  return res.data;
}

export async function createBroadcast(data: { title: string; content: string; target_roles?: string[] }): Promise<{ data: BroadcastData }> {
  const res = await api.post('/platform/broadcasts', data);
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — Billing
// ====================================================================
export interface BillingPlan {
  id: string; name: string; name_ar: string;
  price_monthly: number; price_yearly: number;
  max_staff: number; max_members: number; max_gyms: number;
  features: string[]; is_active: boolean;
  annual_discount_percent?: number;
}

export interface BillingInvoice {
  id: string; gym_id: string; gym_name: string; plan_name: string;
  amount: number; status: string; period_start: string; period_end: string;
  paid_at?: string; created_at: string;
}

export interface BillingSummary {
  paid_count: number; paid_total: number;
  pending_count: number; pending_total: number;
  overdue_count: number; plans: number; active_gyms: number;
}

export async function listBillingPlans(): Promise<{ data: BillingPlan[] }> {
  const res = await api.get('/platform/billing/plans');
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — §36 addons (catalog + per-gym assignments)
// ====================================================================
export interface BillingAddon {
  id: string; code: string; name: string; name_ar: string;
  pricing_type: string; price: number;
  module_keys: string[] | string; limit_column: string | null; limit_amount: number | null;
  price_monthly: number; price_yearly: number;
  is_active: boolean; created_at: string;
  live_assignments?: number;
}

export interface GymAddon {
  id: string; gym_id: string; addon_id: string;
  price_charged: number; cycle: 'monthly' | 'yearly';
  status: 'active' | 'cancelled';
  starts_at: string; expires_at: string | null;
  notes: string | null; created_at: string; cancelled_at: string | null;
  code: string; name: string; name_ar: string;
  module_keys: string[] | string; limit_column: string | null; limit_amount: number | null;
  catalog_price_monthly: number; catalog_price_yearly: number;
  is_expired?: boolean;
}

export async function listAddons(): Promise<{ data: BillingAddon[] }> {
  const res = await api.get('/platform/billing/addons');
  return res.data;
}

export async function createAddon(payload: {
  code: string; name: string; name_ar: string;
  module_keys?: string[]; limit_column?: string | null; limit_amount?: number | null;
  price_monthly: number; price_yearly: number;
}): Promise<{ data: BillingAddon }> {
  const res = await api.post('/platform/billing/addons', payload);
  return res.data;
}

export async function updateAddon(id: string, payload: Partial<BillingAddon>): Promise<{ data: BillingAddon }> {
  const res = await api.put(`/platform/billing/addons/${id}`, payload);
  return res.data;
}

export async function deleteAddon(id: string): Promise<{ data: { deleted?: boolean; soft_deleted?: boolean } }> {
  const res = await api.delete(`/platform/billing/addons/${id}`);
  return res.data;
}

export async function listGymAddons(gymId: string): Promise<{ data: GymAddon[] }> {
  const res = await api.get(`/platform/gyms/${gymId}/addons`);
  return res.data;
}

export async function grantGymAddon(gymId: string, payload: {
  addon_id?: string; code?: string; cycle?: 'monthly' | 'yearly';
  price_charged?: number; expires_at?: string | null; notes?: string | null;
}): Promise<{ data: GymAddon }> {
  const res = await api.post(`/platform/gyms/${gymId}/addons`, payload);
  return res.data;
}

export async function updateGymAddon(gymId: string, assignmentId: string, payload: {
  price_charged?: number; expires_at?: string | null; notes?: string | null;
}): Promise<{ data: GymAddon }> {
  const res = await api.put(`/platform/gyms/${gymId}/addons/${assignmentId}`, payload);
  return res.data;
}

export async function cancelGymAddon(gymId: string, assignmentId: string): Promise<{ data: GymAddon }> {
  const res = await api.post(`/platform/gyms/${gymId}/addons/${assignmentId}/cancel`, {});
  return res.data;
}

export async function listInvoices(params?: { status?: string; limit?: number }): Promise<{ data: BillingInvoice[] }> {
  const res = await api.get('/platform/billing/invoices', { params });
  return res.data;
}

export async function getBillingSummary(): Promise<{ data: BillingSummary }> {
  const res = await api.get('/platform/billing/summary');
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — §40 عقود المنصة (مصدر الحقيقة التعاقدية)
// ====================================================================
export type ContractCycle = 'monthly' | 'yearly';

export interface PlatformContract {
  id: string;
  gym_id: string;
  gym_name: string;
  subdomain: string;
  plan_id: string;
  plan_name: string;
  plan_name_ar: string | null;
  cycle: ContractCycle;
  price: string;
  currency: string;
  status: 'active' | 'cancelled';
  start_date: string;
  renewal_date: string | null;
  auto_renew: boolean;
  notes: string | null;
  created_by: string | null;
  created_by_email: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  effective_features: string[];
  live_items: number;
  items_total: string;
}

export interface ContractItem {
  id: string;
  contract_id: string;
  addon_id: string;
  name: string;
  name_ar: string | null;
  code: string;
  limit_column: string | null;
  limit_amount: number | null;
  quantity: number;
  unit_price: string;
  line_total: string;
  cycle: ContractCycle;
  status: 'active' | 'cancelled';
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractInvoice {
  id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  base_amount: string;
  total_amount: string;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

export async function listContracts(params?: {
  gym_id?: string;
  status?: 'active' | 'cancelled';
  search?: string;
}): Promise<{ data: PlatformContract[] }> {
  const res = await api.get('/platform/billing/contracts', { params });
  return res.data;
}

export async function getContractFull(id: string): Promise<{
  data: { contract: PlatformContract; items: ContractItem[]; invoices: ContractInvoice[] };
}> {
  const res = await api.get(`/platform/billing/contracts/${id}`);
  return res.data;
}

export async function createContract(payload: {
  gym_id: string;
  plan_id: string;
  cycle?: ContractCycle;
  price?: number;
  currency?: string;
  auto_renew?: boolean;
  start_date?: string;
  notes?: string;
}): Promise<{ data: PlatformContract }> {
  const res = await api.post('/platform/billing/contracts', payload);
  return res.data;
}

export async function updateContract(id: string, payload: {
  price?: number;
  renewal_date?: string;
  auto_renew?: boolean;
  notes?: string;
  cycle?: ContractCycle;
}): Promise<{ data: PlatformContract }> {
  const res = await api.patch(`/platform/billing/contracts/${id}`, payload);
  return res.data;
}

export async function cancelContract(id: string, reason?: string): Promise<{ data: PlatformContract }> {
  const res = await api.post(`/platform/billing/contracts/${id}/cancel`, { reason: reason || null });
  return res.data;
}

// التجديد يرجّع العقد وحده، أو {contract, invoice} عند طلب إصدار فاتورة
export async function renewContract(id: string, periods: number, issueInvoice?: boolean): Promise<{
  data: PlatformContract | { contract: PlatformContract; invoice: ContractInvoice };
}> {
  const res = await api.post(`/platform/billing/contracts/${id}/renew`, {
    periods,
    issue_invoice: issueInvoice === true,
  });
  return res.data;
}

export async function issueContractInvoice(id: string): Promise<{
  data: { id: string; invoice_number: string; total_amount: string; due_date: string };
}> {
  const res = await api.post(`/platform/billing/contracts/${id}/invoices`, {});
  return res.data;
}

export async function addContractItem(contractId: string, payload: {
  addon_id: string;
  quantity?: number;
  unit_price?: number;
  cycle?: ContractCycle;
  expires_at?: string | null;
  notes?: string | null;
}): Promise<{ data: ContractItem }> {
  const res = await api.post(`/platform/billing/contracts/${contractId}/items`, payload);
  return res.data;
}

export async function updateContractItem(itemId: string, payload: {
  quantity?: number;
  unit_price?: number;
  expires_at?: string | null;
  notes?: string | null;
}): Promise<{ data: ContractItem }> {
  const res = await api.patch(`/platform/billing/contract-items/${itemId}`, payload);
  return res.data;
}

export async function cancelContractItem(itemId: string): Promise<{ data: ContractItem }> {
  const res = await api.post(`/platform/billing/contract-items/${itemId}/cancel`, {});
  return res.data;
}

export async function markInvoicePaid(invoiceId: string, payload?: {
  payment_method?: string;
  payment_reference?: string;
}): Promise<{ data: ContractInvoice }> {
  const res = await api.post(`/platform/billing/invoices/${invoiceId}/mark-paid`, payload ?? {});
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — §40 رؤى المنصة الحية + طابور التنفيذ + تدقيق المنصة
// ====================================================================
export interface OverviewRenewalItem {
  id: string;
  renewal_date: string;
  cycle: ContractCycle;
  price: string;
  currency: string;
  gym_id: string;
  gym_name: string;
  subdomain: string;
}

export interface OverviewSystemAction {
  gym_id: string;
  gym_name: string;
  action_description: string;
  created_at: string;
}

export interface OverviewTicketItem {
  id: string;
  ticket_number: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
  gym_name: string | null;
}

export interface PlatformOverviewData {
  gyms: { total: number; active: number; suspended: number; on_trial: number; new_this_month: number };
  billing: {
    active_contracts: number;
    mrr_by_currency: { currency: string; mrr: string }[];
    renewals_due_7d: number;
    live_items: number;
    items_month_total: string;
    pending_invoices: number;
    pending_amount: string;
    overdue_invoices: number;
    overdue_amount: string;
  };
  operations: { open_tickets: number; enforcement_actioned: number; non_active_gyms: number };
  feeds: {
    renewals_next_14d: OverviewRenewalItem[];
    last_system_actions: OverviewSystemAction[];
    open_tickets_recent: OverviewTicketItem[];
  };
}

export async function getPlatformOverview(): Promise<{ data: PlatformOverviewData }> {
  const res = await api.get('/platform/overview');
  return res.data;
}

export interface EnforcementRow {
  id: string;
  name: string;
  subdomain: string;
  is_active: boolean;
  tenant_status: string;
  subscription_status: string;
  subscription_expires_at: string | null;
  expired: boolean;
  last_system_action: string | null;
  last_system_note: string | null;
  contract_id: string | null;
  contract_status: string | null;
  cycle: ContractCycle | null;
  price: string | null;
  currency: string | null;
  plan_name: string | null;
  member_count: number;
}

export async function getEnforcementQueue(): Promise<{ data: EnforcementRow[] }> {
  const res = await api.get('/platform/enforcement');
  return res.data;
}

export interface PlatformAuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action_type: string;
  table_name: string;
  record_id: string | null;
  old_values: unknown;
  new_values: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function listPlatformAudit(params?: {
  action?: string;
  table_name?: string;
  gym_id?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: PlatformAuditEntry[]; total: number; limit: number; offset: number }> {
  const res = await api.get('/platform/security/audit', { params });
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — Coupons & Promo Codes
// ====================================================================
export interface BillingCoupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number;
  current_uses: number;
  max_discount_amount: number | null;
  min_plan_tier: string | null;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export async function listCoupons(): Promise<{ data: BillingCoupon[] }> {
  const res = await api.get('/platform/billing/coupons');
  return res.data;
}

export async function createCoupon(payload: {
  code: string; discount_type: 'percentage' | 'fixed'; discount_value: number;
  description?: string; max_uses?: number; max_discount_amount?: number;
  min_plan_tier?: string; valid_until?: string;
}): Promise<{ data: BillingCoupon }> {
  const res = await api.post('/platform/billing/coupons', payload);
  return res.data;
}

export async function deleteCoupon(id: string): Promise<{ data: { message: string } }> {
  const res = await api.delete(`/platform/billing/coupons/${id}`);
  return res.data;
}

export async function validateCoupon(code: string, plan_tier?: string): Promise<{ data: BillingCoupon }> {
  const res = await api.post('/platform/billing/coupons/validate', { code, plan_tier });
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — Fawry Payment
// ====================================================================
export interface FawryPaymentResponse {
  fawry_ref_number: string;
  payment_url: string;
  amount: number;
  message: string;
}

export async function initiateFawryPayment(payload: { gym_id: string; amount: number; invoice_id?: string }): Promise<{ data: FawryPaymentResponse }> {
  const res = await api.post('/platform/billing/payments/fawry', payload);
  return res.data;
}

// ====================================================================
// PLATFORM ADMIN — Security Center
// ====================================================================
export interface SecurityOverview {
  active_sessions: number;
  total_logins: number;
  failed_logins: number;
  active_admins: number;
  two_factor_enabled: boolean;
  password_expiry_days: number;
  ip_whitelist_enabled: boolean;
}

export interface PlatformAdminSession {
  id: string;
  platform_admin_id: string;
  user_agent: string | null;
  ip_address: string | null;
  device_name: string | null;
  last_active_at: string;
  created_at: string;
  revoked_at: string | null;
  email: string;
  full_name: string;
}

export interface SecuritySettings {
  id: number;
  two_factor_enabled: boolean;
  two_factor_method: string;
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_numbers: boolean;
  password_require_symbols: boolean;
  password_expiry_days: number;
  max_login_attempts: number;
  lockout_duration_minutes: number;
  ip_whitelist_enabled: boolean;
  ip_whitelist: string[];
  session_timeout_minutes: number;
  updated_at: string;
}

export async function getSecurityOverview(): Promise<{ data: SecurityOverview }> {
  const res = await api.get('/platform/security/overview');
  return res.data;
}

export async function listPlatformAdminSessions(): Promise<{ data: PlatformAdminSession[] }> {
  const res = await api.get('/platform/security/sessions');
  return res.data;
}

export async function revokePlatformAdminSession(id: string): Promise<{ data: { message: string } }> {
  const res = await api.delete(`/platform/security/sessions/${id}`);
  return res.data;
}

export async function getSecuritySettings(): Promise<{ data: SecuritySettings }> {
  const res = await api.get('/platform/security/settings');
  return res.data;
}

export async function updateSecuritySettings(settings: Partial<SecuritySettings>): Promise<{ data: SecuritySettings }> {
  const res = await api.put('/platform/security/settings', settings);
  return res.data;
}

// ====================================================================
// NOTIFICATIONS ENGINE
// ====================================================================
export interface NotificationChannelConfig {
  id: string;
  provider: string | null;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NotificationSettings {
  [channel: string]: NotificationChannelConfig;
}

export interface NotificationHistoryItem {
  id: string;
  channel: string;
  recipient_type: string | null;
  recipient_id: string | null;
  recipient_label: string | null;
  title: string | null;
  content: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface NotificationSummary {
  total: number;
  today: number;
  pending: number;
  channels: Record<string, number>;
  statuses: Record<string, number>;
  enabled_channels: Record<string, boolean>;
}

export async function getNotificationSettings(): Promise<{ data: NotificationSettings }> {
  const res = await api.get('/platform/notifications/settings');
  return res.data;
}

export async function updateNotificationSettings(
  channel: string,
  payload: { provider?: string; is_enabled?: boolean; config?: Record<string, unknown> }
): Promise<{ data: NotificationChannelConfig }> {
  const res = await api.put(`/platform/notifications/settings/${channel}`, payload);
  return res.data;
}

export async function getNotificationHistory(params?: {
  channel?: string;
  status?: string;
  limit?: number;
}): Promise<{ data: NotificationHistoryItem[] }> {
  const res = await api.get('/platform/notifications/history', { params });
  return res.data;
}

export async function sendTestNotification(payload: {
  channel: string;
  recipient?: string;
}): Promise<{ data: NotificationHistoryItem; message: string }> {
  const res = await api.post('/platform/notifications/test', payload);
  return res.data;
}

export async function markNotificationRead(id: string): Promise<{ data: { id: string; status: string } }> {
  const res = await api.patch(`/platform/notifications/history/${id}/read`);
  return res.data;
}

export async function getNotificationSummary(): Promise<{ data: NotificationSummary }> {
  const res = await api.get('/platform/notifications/summary');
  return res.data;
}

// ===== ONBOARDING WIZARD =====

export interface OnboardingProgress {
  onboarding_complete: boolean;
  onboarding_step: number;
  onboarding_data: Record<string, unknown>;
  gym_count: number;
  admin_count: number;
  settings: Record<string, unknown>;
}

export async function getOnboardingProgress(): Promise<{ data: OnboardingProgress }> {
  const res = await api.get('/platform/onboarding');
  return res.data;
}

export async function saveOnboardingStep(step: number, data: Record<string, unknown>): Promise<{ data: { onboarding_step: number; onboarding_data: Record<string, unknown> } }> {
  const res = await api.post('/platform/onboarding/step', { step, data });
  return res.data;
}

export async function completeOnboarding(final_data?: Record<string, unknown>): Promise<{ data: { onboarding_complete: boolean; message: string } }> {
  const res = await api.post('/platform/onboarding/complete', { final_data });
  return res.data;
}

export async function getPlatformSettings(): Promise<{ data: Record<string, unknown> }> {
  const res = await api.get('/platform/settings');
  return res.data;
}

export async function updatePlatformSettings(settings: Record<string, unknown>): Promise<{ data: { message: string; updated_keys: string[] } }> {
  const res = await api.put('/platform/settings', { settings });
  return res.data;
}

// ===== PLATFORM BRANDING =====

export interface PlatformBranding {
  logo_url: string;
  primary_color: string;
  accent_color: string;
  sidebar_bg: string;
  sidebar_text: string;
  favicon_url: string;
  app_name: string;
  footer_text: string;
  login_bg_image: string;
  custom_css: string;
}

export async function getPlatformBranding(): Promise<{ data: PlatformBranding }> {
  const res = await api.get('/platform/branding');
  return res.data;
}

export interface PublicBranding {
  app_name: string;
  logo_url: string;
  footer_text: string;
}

// الفوتر العام يقرأ الهوية العامة (بلا توثيق — حقول عرض فقط).
export async function getPublicBranding(): Promise<{ data: PublicBranding }> {
  const res = await api.get('/api/branding-public');
  return res.data;
}

export async function updatePlatformBranding(branding: Partial<PlatformBranding>): Promise<{ data: PlatformBranding }> {
  const res = await api.put('/platform/branding', branding);
  return res.data;
}

export async function uploadBrandingFile(file: File): Promise<{ data: { url: string } }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/platform/upload/branding', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// ===== PLATFORM REPORTS =====

export interface PlatformReportOverview {
  gyms: {
    total_gyms: number;
    active_gyms: number;
    basic_plan: number;
    premium_plan: number;
    enterprise_plan: number;
    suspended_gyms: number;
  };
  members: {
    total_members: number;
    active_members: number;
    new_this_month: number;
  };
  revenue: {
    total_invoices: number;
    paid_invoices: number;
    paid_total: number;
    pending_invoices: number;
    pending_total: number;
    overdue_invoices: number;
  };
  staff: {
    total_staff: number;
    managers: number;
    coaches: number;
    receptionists: number;
  };
  mrr: number;
  arr: number;
  monthly_gyms: { month: string; count: number }[];
  monthly_revenue: { month: string; invoice_count: number; paid_amount: number; total_amount: number }[];
  gyms_by_currency: { currency: string; count: number }[];
}

export async function getPlatformReportsOverview(): Promise<{ data: PlatformReportOverview }> {
  const res = await api.get('/platform/reports/overview');
  return res.data;
}

// ===== ADVANCED REPORTS =====

export interface RevenueMonth {
  month: string;
  invoice_count: number;
  revenue: number;
  pending: number;
  overdue: number;
}

export interface RevenueSummary {
  current_revenue: number;
  previous_revenue: number;
  change_percentage: number;
  total_invoices: number;
  total_pending: number;
  total_overdue: number;
}

export interface RevenueTrendResponse {
  current_period: RevenueMonth[];
  previous_period: RevenueMonth[];
  summary: RevenueSummary;
}

export async function getRevenueTrend(period: number = 12, compare: boolean = true): Promise<{ data: RevenueTrendResponse }> {
  const res = await api.get('/platform/reports/revenue-trend', { params: { period, compare: String(compare) } });
  return res.data;
}

export interface OverdueInvoice {
  id: string;
  invoice_number: string;
  amount: number;
  due_date: string;
  created_at: string;
  gym_name: string;
  subdomain: string;
  aging_bucket: string;
  days_overdue: number;
}

export interface OverduePaymentsResponse {
  invoices: OverdueInvoice[];
  total_overdue: number;
  total_count: number;
  aging_summary: Record<string, number>;
}

export async function getOverduePayments(days: number = 30): Promise<{ data: OverduePaymentsResponse }> {
  const res = await api.get('/platform/reports/overdue-payments', { params: { days } });
  return res.data;
}

// ===== ADVANCED REPORTS (Phase 5) =====

export interface ChurnStats {
  total_members: number;
  total_churned: number;
  overall_churn_rate: number;
  churned_this_month: number;
}

export interface MonthlyChurn {
  month: string;
  churned: number;
  total_members: number;
}

export interface ChurnByGym {
  id: string;
  name: string;
  churn_rate: number;
  churned: number;
  total_members: number;
}

export interface ChurnReason {
  count: number;
  reason: string;
}

export interface ChurnAnalysisResponse {
  monthly_churn: MonthlyChurn[];
  stats: ChurnStats;
  churn_by_gym: ChurnByGym[];
  churn_reasons: ChurnReason[];
}

export async function getChurnAnalysis(): Promise<{ data: ChurnAnalysisResponse }> {
  const res = await api.get('/platform/reports/churn-analysis');
  return res.data;
}

export interface GeoDistributionItem {
  country: string;
  city: string;
  gym_count: number;
  member_count: number;
  revenue: number;
}

export async function getGeoDistribution(): Promise<{ data: GeoDistributionItem[] }> {
  const res = await api.get('/platform/reports/geo-distribution');
  return res.data;
}

export interface PlanPerformanceItem {
  plan_tier: string;
  gym_count: number;
  member_count: number;
  revenue: number;
  churn_rate: number;
}

export async function getPlanPerformance(): Promise<{ data: PlanPerformanceItem[] }> {
  const res = await api.get('/platform/reports/plan-performance');
  return res.data;
}

export interface GymPerformanceItem {
  id: string;
  name: string;
  subdomain: string;
  plan_tier: string;
  active_members: number;
  monthly_revenue: number;
  growth_rate: number;
  churn_rate: number;
}

export async function getGymPerformance(): Promise<{ data: GymPerformanceItem[] }> {
  const res = await api.get('/platform/reports/gym-performance');
  return res.data;
}

// ===== BILLING CUSTOM PLANS & TRIALS (Phase 5) =====

export interface CustomPlan {
  id: string;
  gym_id: string;
  name: string;
  name_ar?: string;
  price: number;
  currency: string;
  duration_months: number;
  features: string[];
  max_members: number;
  is_active: boolean;
  created_at: string;
}

export async function listCustomPlans(gym_id?: string): Promise<{ data: CustomPlan[] }> {
  const res = await api.get('/platform/billing/custom-plans', { params: { gym_id } });
  return res.data;
}

export async function createCustomPlan(payload: {
  gym_id: string;
  name: string;
  name_ar?: string;
  price: number;
  currency: string;
  duration_months: number;
  features?: string[];
  max_members: number;
}): Promise<{ data: CustomPlan }> {
  const res = await api.post('/platform/billing/custom-plans', payload);
  return res.data;
}

export interface TrialPeriod {
  id: string;
  gym_id: string;
  trial_days: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export async function listTrials(): Promise<{ data: TrialPeriod[] }> {
  const res = await api.get('/platform/billing/trials');
  return res.data;
}

export async function setTrialPeriod(payload: {
  gym_id: string;
  trial_days: number;
}): Promise<{ data: TrialPeriod }> {
  const res = await api.post('/platform/billing/trials', payload);
  return res.data;
}

// ===== SUPPORT TICKETS EXTENDED (Phase 5) =====

export interface TicketAnalytics {
  total_tickets: number;
  open_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
  closed_tickets: number;
  avg_response_time_hours: number;
  avg_resolution_time_hours: number;
  satisfaction_score: number;
  by_category: { category: string; count: number }[];
  by_priority: { priority: string; count: number }[];
}

export async function getTicketAnalytics(): Promise<{ data: TicketAnalytics }> {
  const res = await api.get('/platform/tickets/analytics');
  return res.data;
}

export async function assignTicket(id: string, assigned_email: string): Promise<{ data: { message: string } }> {
  const res = await api.patch(`/platform/tickets/${id}/assign`, { assigned_email });
  return res.data;
}

export async function addTicketRating(id: string, rating: number, feedback?: string): Promise<{ data: { message: string } }> {
  const res = await api.post(`/platform/tickets/${id}/rating`, { rating, feedback });
  return res.data;
}

export async function updateTicketPriority(id: string, priority: string): Promise<{ data: { message: string } }> {
  const res = await api.patch(`/platform/tickets/${id}/priority`, { priority });
  return res.data;
}

export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export async function listKnowledgeBaseArticles(category?: string): Promise<{ data: KnowledgeBaseArticle[] }> {
  const res = await api.get('/platform/tickets/knowledge-base', { params: { category } });
  return res.data;
}

export async function createKnowledgeBaseArticle(payload: {
  title: string;
  content: string;
  category: string;
  tags?: string[];
}): Promise<{ data: KnowledgeBaseArticle }> {
  const res = await api.post('/platform/tickets/knowledge-base', payload);
  return res.data;
}

export async function deleteKnowledgeBaseArticle(id: string): Promise<{ data: { message: string } }> {
  const res = await api.delete(`/platform/tickets/knowledge-base/${id}`);
  return res.data;
}

// ===== AI ANALYTICS (Phase 5) =====

export interface AIChurnPrediction {
  gym_id: string;
  gym_name: string;
  churn_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  factors: (string | { description: string })[];
  suggested_action?: string;
}

export interface AIPlanRecommendation {
  gym_id: string;
  gym_name: string;
  current_plan: string;
  recommended_plan: string;
  savings_percent?: number;
  reason: string;
  confidence: number;
}

export interface AIRevenueForecast {
  month: string;
  predicted: number;
  lower_bound: number;
  upper_bound: number;
  growth_rate?: number;
}

export interface AIDashboardResponse {
  churn_prediction?: AIChurnPrediction[];
  plan_recommendations?: AIPlanRecommendation[];
  revenue_forecast?: AIRevenueForecast[];
  stats?: {
    high_risk_count: number;
    medium_risk_count: number;
    avg_risk_score: number;
  };
}

export async function getAIDashboard(): Promise<{ data: AIDashboardResponse }> {
  const res = await api.get('/platform/ai/dashboard');
  return res.data;
}

export async function getAIChurnPrediction(): Promise<{ data: AIChurnPrediction[] }> {
  const res = await api.get('/platform/ai/churn');
  return res.data;
}

export async function getAIPlanRecommendations(): Promise<{ data: AIPlanRecommendation[] }> {
  const res = await api.get('/platform/ai/plan-recommendations');
  return res.data;
}

export async function getAIRevenueForecast(months: number = 3): Promise<{ data: AIRevenueForecast[] }> {
  const res = await api.get('/platform/ai/revenue-forecast', { params: { months } });
  return res.data;
}

// ===== GYM REFERRALS (§40-M5) =====
// The staff-side referrals endpoint: GET /api/marketing/referrals
// (analytics.getGymReferrals, scoped to the tenant via referrer_gym_id)
// feeds the gym marketing page's Referrals tab.

export interface ReferralData {
  id: string;
  referral_code: string;
  referrer_name?: string;
  referred_name?: string;
  referred_member_name?: string;
  gym_name?: string;
  reward_amount: number;
  reward_status: string;
  status: string;
  created_at: string;
}

export async function listGymReferrals(): Promise<{ data: ReferralData[] }> {
  const res = await api.get('/api/marketing/referrals');
  return res.data;
}

// ===== PLATFORM MARKETING (§41) =====
// The Phase-5 family that used to call bare '/marketing/*' paths was
// repointed (not deleted) onto the real platform endpoints —
// /platform/marketing/* is nginx-proxied and mounted by
// server/src/routes/platform.ts under authenticatePlatformAdmin + CSRF.
// Shapes match marketing_campaigns / marketing_email_templates (migration 045).

export interface MarketingCampaign {
  id: string;
  name: string;
  name_ar?: string;
  type: string;
  status: string;
  gym_id?: string | null;
  gym_name?: string;
  platform_wide?: boolean;
  budget: number;
  spent_amount?: number;
  start_date?: string | null;
  end_date?: string | null;
  metrics?: { views: number; clicks: number; conversions: number; cost_per_conversion: number };
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  subject_ar?: string;
  body_html?: string;
  type: string;
  is_default?: boolean;
  is_active?: boolean;
  created_at: string;
}

export interface LoyaltySummary {
  total_points: number;
  active_members: number;
  total_redeemed: number;
  by_plan?: { plan_name: string; members: number }[];
}

export async function listCampaigns(): Promise<{ data: MarketingCampaign[] }> {
  const res = await api.get('/platform/marketing/campaigns');
  return res.data;
}

export async function createCampaign(payload: {
  name: string;
  name_ar?: string;
  type: string;
  budget?: number;
  start_date?: string;
  end_date?: string;
  target_audience?: Record<string, unknown>;
  gym_id?: string;
}): Promise<{ data: MarketingCampaign }> {
  const res = await api.post('/platform/marketing/campaigns', payload);
  return res.data;
}

export async function updateCampaignStatus(id: string, status: string): Promise<{ data: MarketingCampaign }> {
  const res = await api.patch(`/platform/marketing/campaigns/${id}/status`, { status });
  return res.data;
}

export async function deleteCampaign(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  const res = await api.delete(`/platform/marketing/campaigns/${id}`);
  return res.data;
}

export async function listEmailTemplates(): Promise<{ data: EmailTemplate[] }> {
  const res = await api.get('/platform/marketing/email-templates');
  return res.data;
}

export async function listPlatformReferrals(): Promise<{ data: ReferralData[] }> {
  const res = await api.get('/platform/marketing/referrals');
  return res.data;
}

export async function getLoyaltySummary(): Promise<{ data: LoyaltySummary }> {
  const res = await api.get('/platform/marketing/loyalty-summary');
  return res.data;
}

// ===== DEVELOPER PORTAL =====

export interface ApiKey {
  id: string;
  gym_id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  allowed_ips: string[];
  rate_limit_per_min: number;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  raw_key?: string;
  message?: string;
}

export interface ApiUsage {
  total_requests: number;
  success_count: number;
  error_count: number;
  avg_response_time_ms: number;
  requests_last_hour: number;
}

export async function listApiKeys(gym_id?: string): Promise<{ data: ApiKey[] }> {
  const res = await api.get('/platform/developer/keys', { params: { gym_id } });
  return res.data;
}

export async function createApiKey(payload: {
  gym_id: string;
  name: string;
  permissions?: string[];
  allowed_ips?: string[];
  rate_limit_per_min?: number;
  expires_at?: string;
}): Promise<{ data: ApiKey }> {
  const res = await api.post('/platform/developer/keys', payload);
  return res.data;
}

export async function deleteApiKey(id: string): Promise<{ data: { message: string } }> {
  const res = await api.delete(`/platform/developer/keys/${id}`);
  return res.data;
}

export async function toggleApiKey(id: string): Promise<{ data: { id: string; is_active: boolean } }> {
  const res = await api.patch(`/platform/developer/keys/${id}/toggle`);
  return res.data;
}

export async function getApiUsage(gym_id?: string, days?: number): Promise<{ data: ApiUsage }> {
  const res = await api.get('/platform/developer/usage', { params: { gym_id, days } });
  return res.data;
}

// ===== TRAINER PROGRESS (§41) =====
// Real staff endpoints backed by trainer_progress_logs (migration 069) and
// server/src/controllers/trainerProgress.ts. Rows are unique per
// (gym, trainer, day); a coach only reads/writes their own, a manager may
// pass trainer_id. Repointed from the dead bare '/trainer/*/progress/*'
// family removed in §40-M5 onto proxied '/api/trainer-progress/*'.

export interface TrainerProgressLog {
  id: string;
  gym_id: string;
  trainer_id: string;
  log_date: string; // YYYY-MM-DD
  client_count: number;
  session_count: number;
  duration_minutes: number;
  notes?: string | null;
  trainer_name?: string;
  created_at: string;
  updated_at: string;
}

export async function getTrainerProgressToday(trainerId?: string): Promise<{ data: TrainerProgressLog | null }> {
  const res = await api.get('/api/trainer-progress/today', { params: trainerId ? { trainer_id: trainerId } : {} });
  return res.data;
}

export async function getTrainerProgressHistory(days = 30, trainerId?: string): Promise<{ data: TrainerProgressLog[] }> {
  const res = await api.get('/api/trainer-progress/history', { params: { days, ...(trainerId ? { trainer_id: trainerId } : {}) } });
  return res.data;
}

export async function saveTrainerProgress(payload: {
  log_date?: string;
  client_count: number;
  session_count: number;
  duration_minutes: number;
  notes?: string | null;
  trainer_id?: string;
}): Promise<{ data: TrainerProgressLog }> {
  const res = await api.post('/api/trainer-progress', payload);
  return res.data;
}

export async function updateTrainerProgress(id: string, data: Partial<TrainerProgressLog>): Promise<{ data: TrainerProgressLog }> {
  const res = await api.put(`/api/trainer-progress/${id}`, data);
  return res.data;
}

export async function deleteTrainerProgress(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  const res = await api.delete(`/api/trainer-progress/${id}`);
  return res.data;
}

export default api;

