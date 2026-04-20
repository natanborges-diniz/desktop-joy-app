import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  nome?: string | null;
  email?: string | null;
  url?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base" };

export function UserAvatar({ nome, email, url, className, size = "md" }: Props) {
  const label = (nome || email || "?").trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <Avatar className={cn(sizes[size], className)}>
      {url ? <AvatarImage src={url} alt={label} /> : null}
      <AvatarFallback className="bg-accent text-accent-foreground font-semibold">
        {initials || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
