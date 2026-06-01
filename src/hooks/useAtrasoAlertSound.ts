import { useEffect, useRef } from "react";

/**
 * Toca o som de alerta 1× quando uma nova demanda atrasada aparece.
 * Debounce por id: só toca se o id ainda não foi alertado nesta sessão.
 */
export function useAtrasoAlertSound(atrasadasIds: string[]) {
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (!primed.current) {
      // Primeira renderização: marca tudo como visto, não toca.
      atrasadasIds.forEach((id) => seen.current.add(id));
      primed.current = true;
      return;
    }
    const novos = atrasadasIds.filter((id) => !seen.current.has(id));
    if (novos.length > 0) {
      novos.forEach((id) => seen.current.add(id));
      try {
        const audio = new Audio("/sounds/alert.mp3");
        audio.volume = 0.7;
        void audio.play().catch(() => {});
      } catch {
        // navegador bloqueou autoplay — silencioso
      }
    }
  }, [atrasadasIds]);
}
