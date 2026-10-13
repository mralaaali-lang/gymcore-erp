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
}

export async function listPlatformGyms(): Promise<{ data: PlatformGym[] }> {
  const res = await api.get('/platform/gyms');
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

export async function listMembers(params?: { search?: string; status?: string; page?: number; limit?: number }) {
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

export async function createMember(data: {
  full_name: string;
  phone_number: string;
  email?: string;
  birth_date?: string;
  plan_id?: string;
  photo_url?: string;
  medical_notes?: string;
}) {
  const res = await api.post('/api/members', data);
  return res.data;
}

export async function blacklistMember(id: string, reason: string) {
  const res = await api.put(`/api/members/${id}/blacklist`, { reason });
  return res.data;
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

export interface WorkflowDefinition {
  id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  icon: string;
  enabled: boolean;
  last_triggered_at: string | null;
}

export async function listWorkflows(): Promise<{ data: WorkflowDefinition[] }> {
  const res = await api.get('/api/workflows');
  return res.data;
}

export async function updateWorkflow(id: string, enabled: boolean): Promise<{ data: WorkflowDefinition }> {
  const res = await api.put(`/api/workflows/${id}`, { enabled });
  return res.data;
}

export async function triggerWorkflow(id: string): Promise<{ data: WorkflowDefinition }> {
  const res = await api.post(`/api/workflows/${id}/trigger`);
  return res.data;
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
}

export async function listOffersManage(): Promise<{ data: MembershipOffer[] }> {
  const res = await api.get('/api/membership-offers/manage');
  return res.data;
}

export async function createOffer(input: { title: string; duration_days: number; price: number }): Promise<{ data: MembershipOffer }> {
  const res = await api.post('/api/membership-offers', input);
  return res.data;
}

export async function updateOffer(id: string, input: Partial<{ title: string; duration_days: number; price: number; is_active: boolean }>): Promise<{ data: MembershipOffer }> {
  const res = await api.put(`/api/membership-offers/${id}`, input);
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
  member_id?: string; page?: number; limit?: number;
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
  day: string;
  capacity: number;
  trainer_name: string;
  booked: number;
}

export async function getUpcomingClasses() {
  const res = await api.get('/api/classes/upcoming');
  return res.data as { data: UpcomingClassData[] };
}

// ====================================================================
// PRODUCTS
// ====================================================================
export interface ProductData {
  id: string;
  name: string; barcode?: string;
  stock_quantity: number; purchase_price: number; selling_price: number;
}
export async function listProducts(search?: string) {
  const res = await api.get('/api/products', { params: { search } });
  return res.data as { data: ProductData[] };
}
export async function getProduct(id: string) {
  const res = await api.get(`/api/products/${id}`);
  return res.data as { data: ProductData };
}
export async function createProduct(data: { name: string; barcode?: string; stock_quantity?: number; purchase_price: number; selling_price: number }) {
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
export async function listPayments(page?: number) {
  const res = await api.get('/api/finance/payments', { params: { page, limit: 20 } });
  return res.data as { data: any[]; pagination: any };
}
export async function createPayment(data: { member_id: string; amount: number; description?: string; payment_method?: string }) {
  const res = await api.post('/api/finance/payments', data);
  return res.data as { data: any };
}
export async function listExpenses() {
  const res = await api.get('/api/finance/expenses');
  return res.data as { data: any[] };
}
export async function createExpense(data: { amount: number; description: string; category_id?: string | null }) {
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
export async function listDebts() {
  const res = await api.get('/api/finance/debts');
  return res.data as { data: any[] };
}
export async function createDebt(data: { member_id: string; amount: number; due_date: string; reason?: string }) {
  const res = await api.post('/api/finance/debts', data);
  return res.data as { data: any };
}
export async function payDebt(id: string, amount: number) {
  const res = await api.post(`/api/finance/debts/${id}/pay`, { amount });
  return res.data as { success: boolean; remaining: number };
}
export async function listCashboxSessions() {
  const res = await api.get('/api/finance/cashbox');
  return res.data as { data: any[] };
}
export async function openCashbox(opening_balance?: number, notes?: string) {
  const res = await api.post('/api/finance/cashbox/open', { opening_balance, notes });
  return res.data as { data: any };
}
export async function closeCashbox(id: string, closing_balance: number, notes?: string) {
  const res = await api.post('/api/finance/cashbox/close', { id, closing_balance, notes });
  return res.data as { data: any };
}
export async function getFinanceSummary() {
  const res = await api.get('/api/finance/summary');
  return res.data as { data: { monthly_revenue: number; monthly_expenses: number; outstanding_debts: number; monthly_sales: number; today_revenue: number; yesterday_revenue: number } };
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
  phone?: string; salary?: number; is_active: boolean; created_at: string;
}
export async function listStaff() {
  const res = await api.get('/api/staff');
  return res.data as { data: StaffData[] };
}
export async function getStaff(id: string) {
  const res = await api.get(`/api/staff/${id}`);
  return res.data as { data: StaffData };
}
export async function createStaff(data: { full_name: string; email: string; password: string; role: string; phone?: string; salary?: number }) {
  const res = await api.post('/api/staff', data);
  return res.data as { data: StaffData };
}
export async function updateStaff(id: string, data: Partial<StaffData>) {
  const res = await api.put(`/api/staff/${id}`, data);
  return res.data as { data: StaffData };
}
export async function listTrainers() {
  const res = await api.get('/api/trainers');
  return res.data as { data: StaffData[] };
}

// ====================================================================
// SHIFTS
// ====================================================================
export async function listShifts() {
  const res = await api.get('/api/staff/shifts');
  return res.data as { data: any[] };
}
export async function clockIn() {
  const res = await api.post('/api/staff/clock-in');
  return res.data as { data: any };
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

export async function listInvoices(params?: { status?: string; limit?: number }): Promise<{ data: BillingInvoice[] }> {
  const res = await api.get('/platform/billing/invoices', { params });
  return res.data;
}

export async function getBillingSummary(): Promise<{ data: BillingSummary }> {
  const res = await api.get('/platform/billing/summary');
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

export async function getReportsOverview(): Promise<{ data: PlatformReportOverview }> {
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

// ===== MARKETING CAMPAIGNS & LOYALTY (Phase 5) =====

export interface MarketingCampaign {
  id: string;
  name: string;
  name_ar?: string;
  type: string;
  description?: string;
  budget: number;
  status: string;
  reach: number;
  conversions: number;
  scheduled_at?: string;
  start_date?: string;
  end_date?: string;
  gym_name?: string;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  name_ar?: string;
  type: string;
  subject: string;
  content?: string;
  created_at: string;
}

export interface LoyaltySummary {
  total_points: number;
  total_points_given: number;
  total_points_used: number;
  active_members: number;
  total_redeemed: number;
  by_plan?: { plan_name: string; members: number }[];
}

export interface ReferralData {
  id: string;
  referral_code: string;
  referrer_name?: string;
  referred_name?: string;
  gym_name?: string;
  referred_member_name?: string;
  reward_amount: number;
  reward_status: string;
  status: string;
  created_at: string;
}

export async function listCampaigns(): Promise<{ data: MarketingCampaign[] }> {
  const res = await api.get('/marketing/campaigns');
  return res.data;
}

export async function createCampaign(payload: {
  name: string;
  name_ar?: string;
  type: string;
  description?: string;
  budget?: number;
  scheduled_at?: string;
}): Promise<{ data: MarketingCampaign }> {
  const res = await api.post('/marketing/campaigns', payload);
  return res.data;
}

export async function updateCampaignStatus(id: string, status: string): Promise<{ data: { message: string } }> {
  const res = await api.patch(`/marketing/campaigns/${id}/status`, { status });
  return res.data;
}

export async function deleteCampaign(id: string): Promise<{ data: { message: string } }> {
  const res = await api.delete(`/marketing/campaigns/${id}`);
  return res.data;
}

export async function listEmailTemplates(): Promise<{ data: EmailTemplate[] }> {
  const res = await api.get('/marketing/email-templates');
  return res.data;
}

export async function createEmailTemplate(payload: {
  name: string;
  name_ar?: string;
  type: string;
  subject: string;
  content?: string;
}): Promise<{ data: EmailTemplate }> {
  const res = await api.post('/marketing/email-templates', payload);
  return res.data;
}

export async function deleteEmailTemplate(id: string): Promise<{ data: { message: string } }> {
  const res = await api.delete(`/marketing/email-templates/${id}`);
  return res.data;
}

export async function getLoyaltySummary(): Promise<{ data: LoyaltySummary }> {
  const res = await api.get('/marketing/loyalty-summary');
  return res.data;
}

export async function listReferrals(): Promise<{ data: ReferralData[] }> {
  const res = await api.get('/marketing/referrals');
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

// ===== TRAINER PROGRESS =====

export interface TrainerProgressLog {
  id?: string;
  trainerId: string;
  gymId: string;
  date: string;
  clientCount: number;
  sessionCount: number;
  durationMinutes: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getTrainerProgressToday(trainerId: string, gymId: string): Promise<{ data: TrainerProgressLog }> {
  const res = await api.get(`/trainer/${trainerId}/progress/today`, { params: { gymId } });
  return res.data;
}

export async function getTrainerProgressHistory(trainerId: string, gymId: string): Promise<{ data: TrainerProgressLog[] }> {
  const res = await api.get(`/trainer/${trainerId}/progress/history`, { params: { gymId } });
  return res.data;
}

export async function createTrainerProgress(progress: Partial<TrainerProgressLog>): Promise<{ data: TrainerProgressLog }> {
  const res = await api.post('/trainer/progress', progress);
  return res.data;
}

export async function updateTrainerProgress(id: string, data: Partial<TrainerProgressLog>): Promise<{ data: TrainerProgressLog }> {
  const res = await api.put(`/trainer/progress/${id}`, data);
  return res.data;
}

export async function deleteTrainerProgress(id: string): Promise<{ data: { message: string } }> {
  const res = await api.delete(`/trainer/progress/${id}`);
  return res.data;
}

export default api;

