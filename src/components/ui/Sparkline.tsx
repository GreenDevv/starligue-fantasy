// Mini-courbe de forme (5 dernières notes LNH). SVG pur, viewBox fixe, couleurs
// en hex bruts (même convention que HandballPitch.tsx / Jersey.tsx). La ligne de
// base 5 = neutre : au-dessus vert, en dessous rouge (palette ARCHITECTURE §8.1).
interface SparklineProps {
  values: number[];
  min?: number;
  max?: number;
  baseline?: number;
  className?: string;
}

const W = 48;
const H = 18;
const PAD = 2;

export function Sparkline({ values, min = 0, max = 10, baseline = 5, className }: SparklineProps) {
  if (values.length === 0) {
    return <span className={className} style={{ display: "inline-block", width: W, height: H }} aria-hidden />;
  }

  const span = max - min || 1;
  const stepX = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  const y = (v: number) => H - PAD - ((Math.max(min, Math.min(max, v)) - min) / span) * (H - PAD * 2);
  const x = (i: number) => PAD + i * stepX;

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values[values.length - 1] ?? baseline;
  const stroke = last >= baseline ? "#34D399" : "#F87171";
  const baseY = y(baseline);

  return (
    <svg
      className={className}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      preserveAspectRatio="none"
      role="img"
    >
      <line x1={0} y1={baseY} x2={W} y2={baseY} stroke="#262D38" strokeWidth={1} strokeDasharray="2 2" />
      {values.length > 1 ? (
        <polyline points={points} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 2 : 1.3} fill={stroke} />
      ))}
    </svg>
  );
}
