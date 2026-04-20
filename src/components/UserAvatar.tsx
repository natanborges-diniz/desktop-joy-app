import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  nome?: string | null;
  email?: string | null;
  url?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Mostra bolinha verde de presença online no canto inferior direito. */
  online?: boolean;
};

const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base" };
const dotSizes = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export function UserAvatar({ nome, email, url, className, size = "md", online }: Props) {
  const label = (nome || email || "?").trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <span className={cn("relative inline-block", className)}>
      <Avatar className={sizes[size]}>
        {url ? <AvatarImage src={url} alt={label} /> : null}
        <AvatarFallback className="bg-accent text-accent-foreground font-semibold">
          {initials || "?"}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full bg-success ring-2 ring-surface",
            dotSizes[size],
          )}
          aria-label="Online"
        />
      )}
    </span>
  );
}
