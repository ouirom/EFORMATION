// Minimal canvas-based chart rendering for embedding static PNG charts into
// exports (e.g. the analytics Excel export) -- deliberately dependency-free
// (no chart.js/recharts) since we only need a handful of simple shapes and a
// PNG data URL out, not an interactive/DOM chart.

const AXIS_COLOR = '#B9BFDD';
const LABEL_COLOR = '#3A3F63';
const GRID_COLOR = '#EEF0F9';

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = 2; // render at 2x for crisp output when embedded/printed
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

export interface BarChartInput {
  labels: string[];
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  valueSuffix?: string;
}

/** Horizontal bar chart -- reads well for long category labels and fits a wide Excel column. */
export function renderBarChartPNG(input: BarChartInput): string {
  const width = input.width ?? 640;
  const height = input.height ?? Math.max(160, 46 * input.labels.length + 30);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const color = input.color ?? '#FF6B4A';

  const labelW = 150;
  const chartX = labelW + 10;
  const chartW = width - chartX - 60;
  const barH = 22;
  const gap = (height - 20) / input.labels.length;
  const max = Math.max(1, ...input.values);

  ctx.font = '12px Calibri, Arial, sans-serif';
  input.labels.forEach((label, i) => {
    const y = 10 + i * gap + gap / 2 - barH / 2;
    const w = (input.values[i] / max) * chartW;

    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'right';
    ctx.fillText(truncate(ctx, label, labelW - 8), labelW, y + barH / 2 + 4);

    ctx.fillStyle = '#F0F1F8';
    ctx.fillRect(chartX, y, chartW, barH);
    ctx.fillStyle = color;
    ctx.fillRect(chartX, y, Math.max(2, w), barH);

    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'left';
    const valueText = `${input.values[i]}${input.valueSuffix ?? ''}`;
    ctx.fillText(valueText, chartX + Math.max(2, w) + 8, y + barH / 2 + 4);
  });

  return canvas.toDataURL('image/png');
}

export interface LineChartInput {
  labels: string[];
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}

/** Simple line/area chart for a time series (e.g. daily activity). */
export function renderLineChartPNG(input: LineChartInput): string {
  const width = input.width ?? 640;
  const height = input.height ?? 260;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const color = input.color ?? '#1E2761';

  const padL = 40, padR = 20, padT = 16, padB = 34;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(1, ...input.values);
  const n = input.values.length;
  const stepX = n > 1 ? chartW / (n - 1) : 0;

  // gridlines
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (chartH / 4) * g;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.stroke();
  }

  const points = input.values.map((v, i) => ({
    x: padL + i * stepX,
    y: padT + chartH - (v / max) * chartH,
  }));

  // area fill
  ctx.beginPath();
  ctx.moveTo(points[0].x, padT + chartH);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = color + '22';
  ctx.fill();

  // line
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // x-axis labels (first, middle, last only -- avoids overlap on long series)
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = '11px Calibri, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(input.labels[0] ?? '', padL, height - 10);
  if (n > 2) {
    ctx.textAlign = 'center';
    ctx.fillText(input.labels[Math.floor((n - 1) / 2)] ?? '', padL + chartW / 2, height - 10);
  }
  ctx.textAlign = 'right';
  ctx.fillText(input.labels[n - 1] ?? '', padL + chartW, height - 10);

  ctx.strokeStyle = AXIS_COLOR;
  ctx.beginPath();
  ctx.moveTo(padL, padT + chartH);
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

export interface PieChartInput {
  labels: string[];
  values: number[];
  colors: string[];
  width?: number;
  height?: number;
}

/** Donut chart with an inline legend -- used for category-style breakdowns. */
export function renderPieChartPNG(input: PieChartInput): string {
  const width = input.width ?? 520;
  const height = input.height ?? 260;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  const cx = 130, cy = height / 2, r = 90, inner = 50;
  const total = input.values.reduce((a, b) => a + b, 0) || 1;

  let angle = -Math.PI / 2;
  input.values.forEach((v, i) => {
    const slice = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = input.colors[i % input.colors.length];
    ctx.fill();
    angle += slice;
  });

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const legendX = 260, rowH = 24;
  ctx.font = '12px Calibri, Arial, sans-serif';
  input.labels.forEach((label, i) => {
    const y = 20 + i * rowH;
    ctx.fillStyle = input.colors[i % input.colors.length];
    ctx.fillRect(legendX, y, 12, 12);
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'left';
    const pct = Math.round((input.values[i] / total) * 100);
    ctx.fillText(`${truncate(ctx, label, 190)} — ${pct}%`, legendX + 18, y + 10.5);
  });

  return canvas.toDataURL('image/png');
}
