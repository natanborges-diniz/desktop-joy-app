import { useEffect } from "react";

/**
 * Prefixa o document.title com "(N)" quando count > 0.
 * Restaura o título base no unmount.
 */
export function useDocumentTitleBadge(count: number, baseTitle = "InFoco Message") {
  useEffect(() => {
    const prefix = count > 0 ? `(${count > 99 ? "99+" : count}) ` : "";
    document.title = `${prefix}${baseTitle}`;
    return () => {
      document.title = baseTitle;
    };
  }, [count, baseTitle]);
}
