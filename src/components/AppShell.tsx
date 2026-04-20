import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, ClipboardList, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/hooks/useUnreadCount";

const items = [
  { to: "/", label: "Conversas", icon: MessageSquare, exact: true, badge: "messages" as const },
  { to: "/demandas", label: "Demandas", icon: ClipboardList, exact: false, badge: null },
  { to: "/notificacoes", label: "Avisos", icon: Bell, exact: false, badge: null },
  { to: "/perfil", label: "Perfil", icon: User, exact: false, badge: null },
];

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function MobileBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1.5 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function AppShell() {
  const location = useLocation();
  const unread = useUnreadCount();
  // No mobile, esconder bottom nav quando dentro de uma conversa específica
  const hideBottomNav = /^\/conversas\/[^/]+/.test(location.pathname);

  return (
    <div className="flex h-[100dvh] w-full bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border bg-gradient-header px-5 text-header-foreground">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Atrium</p>
            <p className="text-[11px] leading-tight text-white/80">Messenger</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map(({ to, label, icon: Icon, exact, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
              {badge === "messages" && <Badge count={unread} />}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>

        {/* Bottom nav — mobile */}
        {!hideBottomNav && (
          <nav className="border-t border-border bg-surface pb-safe md:hidden">
            <div className="grid grid-cols-4">
              {items.map(({ to, label, icon: Icon, exact, badge }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )
                  }
                >
                  <span className="relative">
                    <Icon className="h-5 w-5" />
                    {badge === "messages" && <MobileBadge count={unread} />}
                  </span>
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
