import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { cn } from "@/lib/utils";
import { Store } from "lucide-react";

/**
 * Barra de filtro por loja. Só renderiza quando o usuário tem 2+ lojas.
 * Mostra chip "Todas" + um chip por loja, com badges (demandas não vistas / OS a confirmar).
 */
export function LojaFilterBar({ className }: { className?: string }) {
  const { lojasDoUsuario, lojaSelecionada, setLojaSelecionada, badges, totalDemandas, totalOS } =
    useFiltroLoja();

  if (lojasDoUsuario.length < 2) return null;

  const chips: Array<{ key: string; label: string; value: string | null; d: number; o: number }> = [
    { key: "__ALL__", label: "Todas", value: null, d: totalDemandas, o: totalOS },
    ...lojasDoUsuario.map((l) => ({
      key: l,
      label: l,
      value: l,
      d: badges[l]?.demandas ?? 0,
      o: badges[l]?.os ?? 0,
    })),
  ];

  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto border-b border-border bg-surface px-3 py-2 scroll-thin",
        className,
      )}
    >
      <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {chips.map((c) => {
        const active = (c.value ?? null) === (lojaSelecionada ?? null);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => setLojaSelecionada(c.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            <span className="max-w-[10rem] truncate">{c.label}</span>
            {(c.d > 0 || c.o > 0) && (
              <span className="flex items-center gap-1">
                {c.d > 0 && (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                      active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                    )}
                    title="Demandas não vistas"
                  >
                    {c.d > 99 ? "99+" : c.d}
                  </span>
                )}
                {c.o > 0 && (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                      active ? "bg-primary-foreground text-primary" : "bg-amber-500 text-white",
                    )}
                    title="OS a confirmar"
                  >
                    {c.o > 99 ? "99+" : c.o}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
