import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, CalendarDays, ClipboardList, FilePlus2, Inbox, MessageSquare, MoreHorizontal, PackageCheck, ShieldCheck, User, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useDocumentTitleBadge } from "@/hooks/useDocumentTitleBadge";
import { useAppBadge } from "@/hooks/useAppBadge";
import { useLojaContext } from "@/hooks/useLojaContext";
import { useNotificacoesRealtime } from "@/hooks/useNotificacoesRealtime";

import { ConversasSidebar } from "@/components/ConversasSidebar";
import { PendenciasBanner } from "@/components/PendenciasBanner";
import { PushOnboardingBanner } from "@/components/PushOnboardingBanner";
import { UpdateAvailableBanner } from "@/components/UpdateAvailableBanner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FiltroLojaProvider, useFiltroLoja } from "@/context/FiltroLojaContext";
import { LojaFilterBar } from "@/components/LojaFilterBar";

type Modulo = "menu_loja" | "demandas_minhas_lojas" | "chat_1a1" | null;
type NavItem = {
  to: string;
  label: string;
  icon: typeof MessageSquare;
  exact: boolean;
  badge: "messages" | null;
  modulo: Modulo;
};

const baseItems: NavItem[] = [
  { to: "/", label: "Conversas", icon: MessageSquare, exact: true, badge: "messages", modulo: "chat_1a1" },
  { to: "/demandas", label: "Demandas", icon: Inbox, exact: false, badge: null, modulo: "menu_loja" },
  { to: "/nova-demanda", label: "Abrir", icon: FilePlus2, exact: false, badge: null, modulo: "menu_loja" },
  { to: "/minhas-demandas", label: "Minhas", icon: ClipboardList, exact: false, badge: null, modulo: "menu_loja" },
  { to: "/notificacoes", label: "Avisos", icon: Bell, exact: false, badge: null, modulo: null },
  { to: "/agenda", label: "Agenda", icon: CalendarDays, exact: false, badge: null, modulo: "menu_loja" },
  { to: "/demandas-lojas", label: "Minhas lojas", icon: ShieldCheck, exact: false, badge: null, modulo: "demandas_minhas_lojas" },
  { to: "/recebimento-os", label: "Recebimento", icon: PackageCheck, exact: false, badge: null, modulo: "menu_loja" },
  { to: "/cashback", label: "Cashback", icon: Wallet, exact: false, badge: null, modulo: "menu_loja" },
  { to: "/perfil", label: "Perfil", icon: User, exact: false, badge: null, modulo: null },
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
  const [moreOpen, setMoreOpen] = useState(false);

  useDocumentTitleBadge(unread);
  useAppBadge(unread);
  useNotificacoesRealtime();
  const { acessoTotal, podeMenuLoja, podeSupervisao, podeChat1a1, podeChatGrupo } = useLojaContext();

  const isHome = location.pathname === "/";
  const isConversaRoute =
    isHome ||
    /^\/conversas\/[^/]+/.test(location.pathname) ||
    /^\/grupos\/[^/]+/.test(location.pathname);
  const hideBottomNav =
    /^\/conversas\/[^/]+/.test(location.pathname) ||
    /^\/grupos\/[^/]+/.test(location.pathname) ||
    /^\/demandas\/[^/]+/.test(location.pathname);

  const items = baseItems.filter((it) => {
    if (acessoTotal) return true;
    if (!it.modulo) return true;
    if (it.modulo === "menu_loja") return podeMenuLoja;
    if (it.modulo === "demandas_minhas_lojas") return podeSupervisao;
    if (it.modulo === "chat_1a1") return podeChat1a1 || podeChatGrupo;
    return true;
  });

  // Mobile: até 4 itens diretos + "Mais"; se couberem todos (≤5), mostra tudo.
  const MAX_DIRECT = 5;
  const usesMore = items.length > MAX_DIRECT;
  const primaryItems = usesMore ? items.slice(0, 4) : items;
  const secondaryItems = usesMore ? items.slice(4) : [];
  const bottomCols = primaryItems.length + (usesMore ? 1 : 0);

  const secondaryActive = secondaryItems.some((it) =>
    it.exact ? location.pathname === it.to : location.pathname.startsWith(it.to),
  );

  return (
    <TooltipProvider delayDuration={150}>
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
              <Tooltip key={to}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={to}
                    end={exact}
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
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {label}
                </TooltipContent>
              </Tooltip>
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
          <UpdateAvailableBanner />
          <PushOnboardingBanner />
          <PendenciasBanner />
          <main className="min-h-0 flex-1 overflow-hidden">
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
                {primaryItems.map(({ to, label, icon: Icon, exact, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={exact}
                    className={({ isActive }) =>
                      cn(
                        "flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors",
                        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                      )
                    }
                  >
                    <span className="relative">
                      <Icon className="h-5 w-5" />
                      {badge === "messages" && <MobileBadge count={unread} />}
                    </span>
                    <span className="max-w-full truncate">{label}</span>
                  </NavLink>
                ))}
                {usesMore && (
                  <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                    <SheetTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors",
                          secondaryActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <MoreHorizontal className="h-5 w-5" />
                        <span>Mais</span>
                      </button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
                      <SheetHeader>
                        <SheetTitle>Mais opções</SheetTitle>
                      </SheetHeader>
                      <div className="mt-4 grid grid-cols-1 gap-1">
                        {secondaryItems.map(({ to, label, icon: Icon, exact }) => (
                          <NavLink
                            key={to}
                            to={to}
                            end={exact}
                            onClick={() => setMoreOpen(false)}
                            className={({ isActive }) =>
                              cn(
                                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                                isActive
                                  ? "bg-accent text-accent-foreground"
                                  : "text-foreground hover:bg-muted",
                              )
                            }
                          >
                            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                            <span>{label}</span>
                          </NavLink>
                        ))}
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
              </div>
            </nav>
          )}
        </div>
      </div>
    </TooltipProvider>
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
