import type { ReactNode } from 'react';
import useAuthBranding from './useAuthBranding';

/**
 * The mark at the top of an auth card.
 *
 * It shows the logo the super-admin uploaded under Settings → «الهوية» when one
 * exists, otherwise the icon the screen passes in (every screen keeps a
 * meaningful fallback: a shield for the console, people for the portal, a key
 * for the password flow).
 *
 * The tile flips to a light surface behind a logo so dark artwork stays legible
 * on the always-dark auth background.
 */
export default function AuthBrandMark({ fallback }: { fallback: ReactNode }) {
  const { appName, logoUrl } = useAuthBranding();

  return (
    <div
      className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center overflow-hidden border ${
        logoUrl ? 'bg-white/95 border-white/60' : 'bg-white/[0.06] border-white/10'
      }`}
    >
      {logoUrl ? (
        <img src={logoUrl} alt={appName || 'Logo'} className="w-full h-full object-contain p-2.5" />
      ) : (
        fallback
      )}
    </div>
  );
}
