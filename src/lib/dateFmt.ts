// src/lib/dateFmt.ts
import { Timestamp } from "firebase/firestore";

export function toMillis(d: unknown): number {
  if (!d) return 0;
  if (d instanceof Timestamp) return d.toMillis();
  if (d instanceof Date) return d.getTime();
  if (typeof d === "string") return new Date(d).getTime();
  return 0;
}

export function toYMD(d: unknown): string {
  if (!d) return "";
  if (d instanceof Timestamp) return d.toDate().toISOString().slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === "string") return d.slice(0, 10);
  return "";
}

export function toMonth(d: unknown): string {
  // YYYY-MM
  const ymd = toYMD(d);
  return ymd ? ymd.slice(0, 7) : "";
}

export function monthOf(obj: any): string {
  if (obj?.ym && typeof obj.ym === "string") return obj.ym;
  const m = toMonth(obj?.date as Timestamp | Date | string);
  if (m) return m;
  if (obj?.month && typeof obj.month === "string") return obj.month;
  return "";
}