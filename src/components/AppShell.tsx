import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, ClipboardList, FilePlus2, Inbox, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useDocumentTitleBadge } from "@/hooks/useDocumentTitleBadge";
import { useAppBadge } from "@/hooks/useAppBadge";
import { useLojaContext } from "@/hooks/useLojaContext";
import { ConversasSidebar } from "@/components/ConversasSidebar";

type NavItem = {
  to: string;
  label: string;
  icon: typeof MessageSquare;
  exact: boolean;
  badge: "messages" | null;
  lojaOnly?: boolean;
};

const baseItems: NavItem[] = [
  { to: "/", label: "Conversas", icon: MessageSquare, exact: true, badge: "messages" },
  { to: "/demandas", label: "Demandas", icon: Inbox, exact: false, badge: null, lojaOnly: true },
  { to: "/nova-demanda", label: "Abrir", icon: FilePlus2, exact: false, badge: null, lojaOnly: true },
  { to: "/minhas-demandas", label: "Minhas", icon: ClipboardList, exact: false, badge: null, lojaOnly: true },
  { to: "/notificacoes", label: "Avisos", icon: Bell, exact: false, badge: null },
  { to: "/perfil", label: "Perfil", icon: User, exact: false, badge: null },
];

function MobileBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1.5 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function RailBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-sidebar">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function AppShell() {
  const location = useLocation();
  const unread = useUnreadCount();
  useDocumentTitleBadge(unread);
  useAppBadge(unread);
  const { isLoja } = useLojaContext();

  const isHome = location.pathname === "/";
  const isConversaRoute = isHome || /^\/conversas\/[^/]+/.test(location.pathname);
  // No mobile, esconder bottom nav quando dentro de uma conversa específica ou de uma demanda específica
  const hideBottomNav =
    /^\/conversas\/[^/]+/.test(location.pathname) ||
    /^\/demandas\/[^/]+/.test(location.pathname);

  const items = baseItems.filter((it) => !it.lojaOnly || isLoja);
  const bottomCols = items.length;

  return (
    <div className="flex h-[100dvh] w-full bg-background">
      {/* Rail estreito de ícones — desktop */}
      <aside className="hidden w-16 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3 md:flex">
        <img
          src="/icon-192.png"
          alt="InFoco Message"
          className="mb-3 h-10 w-10 rounded-xl shadow-soft"
          draggable={false}
        />
        <nav className="flex flex-1 flex-col items-center gap-1.5">
          {items.map(({ to, label, icon: Icon, exact, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              title={label}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )
              }
            >
              <Icon className="h-5 w-5" />
              {badge === "messages" && <RailBadge count={unread} />}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Sidebar de conversas — desktop, sempre visível em rotas de conversa */}
      {isConversaRoute && (
        <aside className="hidden w-80 shrink-0 border-r border-border md:flex md:flex-col lg:w-96">
          <ConversasSidebar embedded />
        </aside>
      )}

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-hidden">
          {/* Em "/" no desktop, mostra placeholder; no mobile a Outlet renderiza a lista */}
          {isHome ? (
            <>
              <div className="hidden h-full md:block">
                <ChatPlaceholder />
              </div>
              <div className="h-full md:hidden">
                <Outlet />
              </div>
            </>
          ) : (
            <Outlet />
          )}
        </main>

        {/* Bottom nav — mobile */}
        {!hideBottomNav && (
          <nav className="border-t border-border bg-surface pb-safe md:hidden">
            <div className="grid" style={{ gridTemplateColumns: `repeat(${bottomCols}, minmax(0, 1fr))` }}>
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

function ChatPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-muted px-6 text-center">
      <img
        src="/icon-512.png"
        alt="InFoco Message"
        className="h-20 w-20 rounded-2xl shadow-elevated"
        draggable={false}
      />
      <h2 className="text-lg font-semibold text-foreground">Selecione uma conversa</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Escolha um contato à esquerda para começar a trocar mensagens.
      </p>
    </div>
  );
}
