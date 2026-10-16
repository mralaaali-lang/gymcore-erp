import { useMemo } from 'react';
import { Barbell as Dumbbell, ActivityIcon as Activity, Lightning as Zap, Target } from '@phosphor-icons/react';

// ─── Ambient background shared by every unauthenticated GymCore screen ───
// These values are copied verbatim from AdminLoginPage. Keeping them in one
// place is what stops the auth screens drifting apart again: the member portal
// and the password screens used to carry their own orange/cyan split.
const BG_ICONS = [Dumbbell, Activity, Zap, Target];
const PARTICLE_COUNT = 8;

function randomBetween(min: number, max: number) { return Math.random() * (max - min) + min; }

/** Root paint for any screen using <AuthAmbience />. Apply to the same element. */
export const AUTH_ROOT_BG = 'linear-gradient(135deg, #0a1628 0%, #0f1a2e 30%, #13203a 60%, #0d1f2c 100%)';

/** Single accent for the whole unauthenticated area. */
export const AUTH_ACCENT = '#06b6d4';

export default function AuthAmbience() {
  const particles = useMemo(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      Icon: BG_ICONS[i % BG_ICONS.length],
      x: randomBetween(5, 95),
      y: randomBetween(5, 95),
      size: randomBetween(28, 64),
      delay: randomBetween(0, 8),
      duration: randomBetween(12, 20),
      opacity: randomBetween(0.03, 0.08),
      rotation: randomBetween(-20, 20),
    })), []);

  return (
    <>
      {/* 1. Main gradient mesh */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 15% 20%, rgba(6,182,212,0.12) 0%, transparent 55%),
            radial-gradient(ellipse at 85% 15%, rgba(245,158,11,0.08) 0%, transparent 45%),
            radial-gradient(ellipse at 50% 80%, rgba(6,182,212,0.06) 0%, transparent 50%)
          `,
        }}
      />

      {/* 2. Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(110,231,183,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(110,231,183,0.15) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* 3. Animated glow orbs */}
      <div className="absolute top-[15%] right-[20%] w-[500px] h-[500px] rounded-full bg-[#06b6d4]/8 blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="absolute bottom-[20%] left-[10%] w-[400px] h-[400px] rounded-full bg-[#f59e0b]/6 blur-[100px] animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }} />
      <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] rounded-full bg-[#06b6d4]/5 blur-[90px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '4s' }} />

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
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(10,22,40,0.6) 100%)',
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
