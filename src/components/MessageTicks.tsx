import { Check, CheckCheck, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type TickStatus = "pending" | "sent" | "read";

export function MessageTicks({
  status,
  className,
}: {
  status: TickStatus;
  className?: string;
}) {
  if (status === "pending")
    return (
      <Clock3
        className={cn("h-3.5 w-3.5 text-muted-foreground", className)}
        aria-label="Enviando"
      />
    );
  if (status === "read")
    return (
      <CheckCheck
        className={cn("h-4 w-4 text-sky-500", className)}
        aria-label="Lida"
      />
    );
  return (
    <Check
      className={cn("h-4 w-4 text-muted-foreground", className)}
      aria-label="Enviada"
    />
  );
}
