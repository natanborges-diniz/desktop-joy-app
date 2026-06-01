// Helpers de SLA escalonado para demandas de loja.

export type SlaLevel = "ok" | "warn" | "danger" | "critical";

export function slaLevelFromMinutes(min: number): SlaLevel {
  if (min < 15) return "ok";
  if (min < 30) return "warn";
  if (min < 60) return "danger";
  return "critical";
}

export function slaMinutesSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

export function slaChipClass(level: SlaLevel): string {
  switch (level) {
    case "ok":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "warn":
      return "bg-amber-400/20 text-amber-800 dark:text-amber-200";
    case "danger":
      return "bg-orange-500/20 text-orange-800 dark:text-orange-200";
    case "critical":
      return "bg-red-600/20 text-red-700 dark:text-red-300";
  }
}

export function slaLabel(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}` : `${h}h`;
}

export type Escalonamentos = {
  t15_at?: string | null;
  t30_at?: string | null;
  t60_at?: string | null;
  t120_at?: string | null;
};

export function escalonamentosDe(metadata: unknown): Escalonamentos {
  if (!metadata || typeof metadata !== "object") return {};
  const esc = (metadata as Record<string, unknown>).escalonamentos;
  if (!esc || typeof esc !== "object") return {};
  return esc as Escalonamentos;
}
