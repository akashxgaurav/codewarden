import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyPoint } from "@/lib/stats";

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: DailyPoint }[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-ink">{point.label}</p>
      <p className="mt-1 text-ink-muted">
        {point.total} error{point.total === 1 ? "" : "s"}
      </p>
      <p className="text-ink-muted">{point.fixed} fixed</p>
      <p className="text-ink-muted">{point.unresolved} unresolved</p>
    </div>
  );
}

/**
 * Daily error volume for the selected window.
 *
 * The bars of the current period are highlighted so the comparison with the
 * previous period is visible at a glance.
 */
export function TrendChart({
  points,
  highlightFrom,
}: {
  points: DailyPoint[];
  highlightFrom: number;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--color-ink-faint)"
            tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            stroke="var(--color-ink-faint)"
            tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />

          <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={38}>
            {points.map((point, index) => (
              <Cell
                key={`${point.date}-${index}`}
                fill={
                  index >= highlightFrom ? "var(--color-brand)" : "var(--color-line-strong)"
                }
              />
            ))}
          </Bar>

          <Line
            type="monotone"
            dataKey="fixed"
            stroke="var(--color-positive)"
            strokeWidth={2}
            dot={{ r: 2, fill: "var(--color-positive)" }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * How the errors of the current period are distributed over the outcomes.
 */
export function StatusBreakdownChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
        >
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            stroke="var(--color-ink-faint)"
            tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={104}
            stroke="var(--color-ink-faint)"
            tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.06)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-xl">
                  <p className="font-medium text-ink">{label}</p>
                  <p className="mt-1 text-ink-muted">
                    {payload[0].value} of {total} errors
                  </p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
