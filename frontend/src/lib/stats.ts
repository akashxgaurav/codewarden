import { addDays, isWithinInterval, startOfDay, subDays } from "date-fns";
import type { Incident } from "@/types";

/**
 * Aggregation helpers for the dashboard.
 *
 * The dashboard compares the current period (today or the last N days) with
 * the equally long period right before it, so a team can see whether things
 * are getting better or worse.
 */

export interface PeriodStats {
  total: number;
  fixed: number;
  notFixable: number;
  validationFailed: number;
  undiagnosed: number;
  pending: number;
  /** Errors that still need a human decision. */
  unresolved: number;
  /** Share of errors that ended up as a branch with a regression test. */
  fixRate: number;
}

export interface PeriodComparison {
  days: number;
  current: PeriodStats;
  previous: PeriodStats;
  totalDelta: number;
  fixRateDelta: number;
  trend: "up" | "down" | "flat";
}

export interface DailyPoint {
  date: string;
  label: string;
  total: number;
  fixed: number;
  unresolved: number;
}

export const EMPTY_PERIOD_STATS: PeriodStats = {
  total: 0,
  fixed: 0,
  notFixable: 0,
  validationFailed: 0,
  undiagnosed: 0,
  pending: 0,
  unresolved: 0,
  fixRate: 0,
};

export function buildPeriodStats(incidents: Incident[]): PeriodStats {
  const stats: PeriodStats = { ...EMPTY_PERIOD_STATS };

  for (const incident of incidents) {
    stats.total += 1;

    switch (incident.status) {
      case "fixed":
        stats.fixed += 1;
        break;
      case "not_fixable":
        stats.notFixable += 1;
        break;
      case "validation_failed":
        stats.validationFailed += 1;
        break;
      case "pending":
        stats.pending += 1;
        break;
      default:
        stats.undiagnosed += 1;
        break;
    }
  }

  stats.unresolved = stats.total - stats.fixed;
  stats.fixRate = stats.total > 0 ? stats.fixed / stats.total : 0;

  return stats;
}

export function comparePeriods(
  incidents: Incident[],
  days: number,
  now: Date = new Date(),
): PeriodComparison {
  const windowDays = Math.max(1, days);
  const currentStart = startOfDay(subDays(now, windowDays - 1));
  const previousStart = startOfDay(subDays(now, windowDays * 2 - 1));
  const previousEnd = startOfDay(subDays(now, windowDays - 1));

  const currentIncidents = incidents.filter((incident) =>
    isWithinInterval(incident.createdAt, { start: currentStart, end: now }),
  );

  const previousIncidents = incidents.filter((incident) =>
    isWithinInterval(incident.createdAt, { start: previousStart, end: previousEnd }),
  );

  const current = buildPeriodStats(currentIncidents);
  const previous = buildPeriodStats(previousIncidents);

  return {
    days: windowDays,
    current,
    previous,
    totalDelta: current.total - previous.total,
    fixRateDelta: current.fixRate - previous.fixRate,
    trend: current.total > previous.total ? "up" : current.total < previous.total ? "down" : "flat",
  };
}

export function dailySeries(
  incidents: Incident[],
  days: number,
  now: Date = new Date(),
): DailyPoint[] {
  const windowDays = Math.max(1, days);
  const points: DailyPoint[] = [];

  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const day = startOfDay(subDays(now, offset));
    const next = addDays(day, 1);

    const ofDay = incidents.filter((incident) =>
      isWithinInterval(incident.createdAt, { start: day, end: next }),
    );

    const stats = buildPeriodStats(ofDay);

    points.push({
      date: day.toISOString(),
      label: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      total: stats.total,
      fixed: stats.fixed,
      unresolved: stats.unresolved,
    });
  }

  return points;
}

/**
 * Groups incidents by the file that has to change the most often. It points
 * at the part of the codebase that keeps breaking.
 */
export function topFailingFiles(incidents: Incident[], limit = 5) {
  const counter = new Map<string, number>();

  for (const incident of incidents) {
    for (const file of incident.affectedFiles ?? []) {
      counter.set(file, (counter.get(file) ?? 0) + 1);
    }
  }

  return [...counter.entries()]
    .map(([file, count]) => ({ file, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

/**
 * Groups the errors by the branch they produced, which shows how much of the
 * work is ready for review.
 */
export function branchSummary(incidents: Incident[]) {
  const branches = incidents.filter((incident) => incident.fixBranch);

  return {
    total: branches.length,
    pushed: branches.filter((incident) => incident.pushed).length,
    localOnly: branches.filter((incident) => !incident.pushed).length,
    files: new Set(branches.flatMap((incident) => incident.affectedFiles ?? [])).size,
  };
}
