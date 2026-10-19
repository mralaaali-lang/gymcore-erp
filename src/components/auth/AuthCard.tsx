import type { ReactNode } from 'react';

/**
 * The glass pane every unauthenticated screen renders into.
 *
 * It lives here so the four auth screens (admin console, member/team portal,
 * forgot password, reset password) cannot drift apart again: the `.glass-card`
 * primitive, the rim glow and the radius/padding are typed once. The glow is
 * deliberately weak and tight — enough to light the edge of the pane, not
 * enough to tint the whole card cyan/amber.
 */
export default function AuthCard({
  children,
  className = '',
  wrapperClassName = '',
}: {
  children: ReactNode;
  className?: string;
  /** Extra classes for the outer positioning layer (entrance transitions etc.). */
  wrapperClassName?: string;
}) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      {/* Rim glow */}
      <div className="absolute -inset-[1px] rounded-[32px] bg-gradient-to-br from-auth-accent/25 via-transparent to-auth-amber/15 blur-[6px]" />
      <div className={`glass-card relative rounded-[32px] p-7 sm:p-9 ${className}`}>
        {children}
      </div>
    </div>
  );
}
