import { useEffect } from "react";
import { setAppBadge } from "@/lib/push";

/** Sincroniza o badge do ícone do app (PWA instalado) com a contagem informada. */
export function useAppBadge(count: number) {
  useEffect(() => {
    setAppBadge(count);
  }, [count]);
}
