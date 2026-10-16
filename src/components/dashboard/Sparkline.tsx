/**
 * Sparkline — a 40px trend strip inside a KPI card.
 *
 * The stroke goes through `style`, not an SVG attribute: `stroke="hsl(var(…))"`
 * would not resolve, while a CSS declaration does. So the line follows the
 * shell's series token and retints with dark mode on its own.
 */
export default function Sparkline({ data, colorVar }: { data: number[]; colorVar: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 36 - ((v - min) / range) * 32 - 2;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-10 mt-3">
      <polyline
        points={points}
        fill="none"
        style={{ stroke: `hsl(var(${colorVar}))` }}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
