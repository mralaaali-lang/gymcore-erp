import { useApiQuery } from '../../hooks/useApiQuery';
import { getPublicBranding } from '../../services/api';

/**
 * Platform identity (app name + logo) for the unauthenticated screens.
 *
 * `/api/branding-public` is the only endpoint in the app that answers without a
 * session — the full branding object stays behind super-admin auth — so it is
 * what the login shells, the password flow and `AppLayout`'s footer all read.
 * The super-admin fills it in under Settings → «الهوية».
 */
export default function useAuthBranding() {
  const { data } = useApiQuery(
    ['branding', 'public'],
    () => getPublicBranding(),
    { staleTime: 10 * 60_000, retry: false }
  );

  return {
    appName: data?.data?.app_name?.trim() || '',
    logoUrl: data?.data?.logo_url?.trim() || '',
  };
}
