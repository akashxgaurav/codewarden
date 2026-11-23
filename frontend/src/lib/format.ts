import { formatDistanceToNow, format, isToday, isYesterday, isThisYear } from "date-fns";
import type { IncidentStatus } from "@/types";

export function formatRelativeTime(timestamp: number) {
  if (!timestamp) {
    return "-";
  }

  return formatDistanceToNow(timestamp, { addSuffix: true });
}

export function formatDate(timestamp: number) {
  if (!timestamp) {
    return "-";
  }

  const date = new Date(timestamp);

  if (isToday(date)) {
    return `Today, ${format(date, "HH:mm")}`;
  }

  if (isYesterday(date)) {
    return `Yesterday, ${format(date, "HH:mm")}`;
  }

  if (isThisYear(date)) {
    return format(date, "d MMM, HH:mm");
  }

  return format(date, "d MMM yyyy, HH:mm");
}

export function formatDuration(ms: number) {
  if (!ms || ms < 0) {
    return "-";
  }

  const seconds = Math.round(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return `${minutes}m ${remainder}s`;
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatStatus(status: IncidentStatus) {
  switch (status) {
    case "fixed":
      return "Fixed";
    case "not_fixable":
      return "Not fixable";
    case "validation_failed":
      return "Validation failed";
    case "no_diagnosis":
      return "No diagnosis";
    case "pending":
      return "In progress";
    case "running":
      return "Running";
    default:
      return "Failed";
  }
}

export function truncate(text: string, maxLength: number) {
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}
