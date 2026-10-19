import { useMemo } from 'react';
import { Barbell as Dumbbell, ActivityIcon as Activity, Lightning as Zap, Target } from '@phosphor-icons/react';

// ─── Ambient background shared by every unauthenticated GymCore screen ───
// Every unauthenticated route renders <AuthAmbience /> (the admin console, the
// member/team portal and both password screens), so the wallpaper is tuned in
// one place instead of being retyped per page. It is deliberately sparse and
// faint: the card is the focal point, and the animation is there only to stop
// the page reading as a flat navy rectangle.
const BG_ICONS = [Dumbbell, Activity, Zap, Target];
const PARTICLE_COUNT = 5;

function randomBetween(min: number, max: number) { return Math.random() * (max - min) + min; }

/** Root paint for every unauthenticated screen (both logins + password flow). */
export const AUTH_ROOT_BG = 'var(--auth-root-bg)';

/**
 * Single accent for the whole unauthenticated area. This is the one raw hex
 * left in the auth layer: `<PwaInstallPrompts accentColor>` needs a literal
 * string, not a `var()`. Keep it equal to `--auth-accent` in tokens.css.
 */
export const AUTH_ACCENT = '#06b6d4';

export default function AuthAmbience() {
  const particles = useMemo(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      Icon: BG_ICONS[i % BG_ICONS.length],
      x: randomBetween(5, 95),
      y: randomBetween(5, 95),
      size: randomBetween(24, 48),
      delay: randomBetween(0, 8),
      duration: randomBetween(14, 22),
      opacity: randomBetween(0.02, 0.05),
      rotation: randomBetween(-20, 20),
    })), []);

  return (
    <>
      {/* 1. Main gradient mesh */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 15% 20%, hsl(var(--auth-accent) / 0.12) 0%, transparent 55%),
            radial-gradient(ellipse at 85% 15%, hsl(var(--auth-amber) / 0.08) 0%, transparent 45%),
            radial-gradient(ellipse at 50% 80%, hsl(var(--auth-accent) / 0.06) 0%, transparent 50%)
          `,
        }}
      />

      {/* 2. Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--auth-grid-line) / 0.15) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--auth-grid-line) / 0.15) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* 3. Animated glow orbs — two only. A third one sat right behind the card
             and muddied the glass, so the header glow belongs to the card now. */}
      <div className="absolute top-[15%] right-[20%] w-[460px] h-[460px] rounded-full bg-auth-accent/6 blur-[130px] animate-pulse" style={{ animationDuration: '9s' }} />
      <div className="absolute bottom-[18%] left-[12%] w-[380px] h-[380px] rounded-full bg-auth-amber/5 blur-[110px] animate-pulse" style={{ animationDuration: '11s', animationDelay: '2s' }} />

      {/* 4. Floating sport icons */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animation: `floatIcon ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
            opacity: p.opacity,
            transform: `rotate(${p.rotation}deg)`,
          }}
        >
          <p.Icon size={p.size} strokeWidth={1} className="text-white" />
        </div>
      ))}

      {/* 5. Subtle vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 50%, hsl(var(--auth-bg-1) / 0.6) 100%)',
      }} />

      <style>{`
        @keyframes floatIcon {
          0%   { transform: translateY(0px) rotate(var(--rotation, 0deg)); }
          50%  { transform: translateY(-18px) rotate(calc(var(--rotation, 0deg) + 5deg)); }
          100% { transform: translateY(0px) rotate(var(--rotation, 0deg)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-fx *, .auth-fx *::before, .auth-fx *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
        }
      `}</style>
    </>
  );
}
