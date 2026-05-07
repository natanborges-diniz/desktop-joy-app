import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase, type MensagemInterna, type Profile } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { UserAvatar } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, MessageSquare, Plus, PenSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { NovaConversaDialog } from "@/components/NovaConversaDialog";
import { usePresence } from "@/hooks/usePresence";
import { MessageTicks } from "@/components/MessageTicks";
import { mensagensSelectColumns } from "@/lib/mensagensColumns";

type Conversation = {
  otherId: string;
  profile: Profile | null;
  lastMessage: MensagemInterna;
  unread: number;
};

interface Props {
  /** Quando true, oculta o cabeçalho com título "Conversas" (usado no desktop, onde já há rail). */
  embedded?: boolean;
  /** Mostrar estado vazio com CTA. Padrão true. */
  showEmptyCta?: boolean;
}

export function ConversasSidebar({ embedded = false, showEmptyCta = true }: Props) {
  const { user } = useAuth();
  const { otherId: activeId } = useParams<{ otherId: string }>();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MensagemInterna[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "nao_lidas">("todas");
  const [novaOpen, setNovaOpen] = useState(false);
  const onlineIds = usePresence();

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function load() {
      setLoading(true);
      const cols = await mensagensSelectColumns();
      const { data, error } = await supabase
        .from("mensagens_internas")
        .select(cols)
        .or(`remetente_id.eq.${user!.id},destinatario_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!active) return;
      if (error) {
        setLoading(false);
        return;
      }
      const msgs = ((data ?? []) as unknown) as MensagemInterna[];
      setMessages(msgs);

      const otherIds = Array.from(
        new Set(msgs.map((m) => (m.remetente_id === user!.id ? m.destinatario_id : m.remetente_id))),
      );
      if (otherIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,nome,email,cargo,setor_id,avatar_url,ativo")
          .in("id", otherIds);
        if (active && profs) {
          const map: Record<string, Profile> = {};
          for (const p of profs as Profile[]) map[p.id] = p;
          setProfiles(map);
        }
      }
      setLoading(false);
    }

    void load();

    const channel = supabase
      .channel(`conversas-sidebar-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mensagens_internas" },
        () => void load(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const conversations = useMemo<Conversation[]>(() => {
    if (!user) return [];
    const map = new Map<string, Conversation>();
    for (const m of messages) {
      const otherId = m.remetente_id === user.id ? m.destinatario_id : m.remetente_id;
      const existing = map.get(otherId);
      const isUnread = m.destinatario_id === user.id && !m.lida;
      if (!existing) {
        map.set(otherId, {
          otherId,
          profile: profiles[otherId] ?? null,
          lastMessage: m,
          unread: isUnread ? 1 : 0,
        });
      } else if (isUnread) {
        existing.unread += 1;
      }
    }
    let list = Array.from(map.values());
    if (filter === "nao_lidas") {
      list = list.filter((c) => c.unread > 0);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.profile?.nome?.toLowerCase().includes(q) ||
          c.profile?.email?.toLowerCase().includes(q) ||
          c.lastMessage.conteudo.toLowerCase().includes(q),
      );
    }
    return list.sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime(),
    );
  }, [messages, profiles, user, search, filter]);

  const totalUnread = useMemo(
    () =>
      messages.reduce(
        (acc, m) => (m.destinatario_id === user?.id && !m.lida ? acc + 1 : acc),
        0,
      ),
    [messages, user],
  );

  return (
    <div className="flex h-full flex-col bg-surface">
      <header
        className={cn(
          "px-4 pt-safe",
          embedded
            ? "border-b border-border bg-surface text-foreground"
            : "bg-gradient-header text-header-foreground",
        )}
      >
        <div className="flex h-14 items-center justify-between md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Conversas</h1>
          <Button
            type="button"
            size="sm"
            onClick={() => setNovaOpen(true)}
            className={cn(
              "hidden gap-2 md:inline-flex",
              embedded
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "bg-white/15 text-header-foreground backdrop-blur hover:bg-white/25",
            )}
          >
            <PenSquare className="h-4 w-4" />
            Nova
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar conversas"
            className={cn(
              "pl-9 shadow-sm",
              embedded
                ? "border-border bg-surface-muted text-foreground placeholder:text-muted-foreground"
                : "border-0 bg-white/95 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-white/50",
            )}
          />
        </div>
        <div className="flex gap-1.5 py-2.5">
          <FilterChip
            active={filter === "todas"}
            onClick={() => setFilter("todas")}
            embedded={embedded}
          >
            Todas
          </FilterChip>
          <FilterChip
            active={filter === "nao_lidas"}
            onClick={() => setFilter("nao_lidas")}
            embedded={embedded}
            badge={totalUnread}
          >
            Não lidas
          </FilterChip>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState onNova={showEmptyCta ? () => setNovaOpen(true) : undefined} />
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => {
              const isActive = activeId === c.otherId;
              return (
                <li key={c.otherId}>
                  <Link
                    to={`/conversas/${c.otherId}`}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-colors",
                      isActive ? "bg-accent" : "hover:bg-surface-muted",
                    )}
                  >
                    <UserAvatar
                      nome={c.profile?.nome}
                      email={c.profile?.email}
                      url={c.profile?.avatar_url}
                      online={onlineIds.has(c.otherId)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-semibold text-foreground">
                          {c.profile?.nome || c.profile?.email || "Usuário"}
                        </p>
                        <time className="shrink-0 text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(c.lastMessage.created_at), {
                            locale: ptBR,
                            addSuffix: false,
                          })}
                        </time>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {c.lastMessage.remetente_id === user?.id && !c.lastMessage.apagada_em && (
                          <MessageTicks
                            status={c.lastMessage.lida ? "read" : "sent"}
                            className="shrink-0"
                          />
                        )}
                        <p
                          className={cn(
                            "truncate text-sm",
                            c.lastMessage.apagada_em
                              ? "italic text-muted-foreground"
                              : c.unread > 0
                                ? "font-medium text-foreground"
                                : "text-muted-foreground",
                          )}
                        >
                          {c.lastMessage.apagada_em
                            ? "🚫 Mensagem apagada"
                            : c.lastMessage.conteudo
                              || (c.lastMessage.anexo_tipo?.startsWith("image/")
                                ? "📷 Foto"
                                : c.lastMessage.anexo_url
                                  ? "📎 Anexo"
                                  : "")}
                        </p>
                        {c.unread > 0 && (
                          <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* FAB mobile (apenas quando não embutido / mobile usa esta lista cheia) */}
      {!embedded && (
        <button
          type="button"
          onClick={() => setNovaOpen(true)}
          aria-label="Nova conversa"
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-floating transition-transform hover:scale-105 active:scale-95 md:hidden"
        >
          <PenSquare className="h-5 w-5" />
        </button>
      )}

      <NovaConversaDialog open={novaOpen} onOpenChange={setNovaOpen} />
    </div>
  );
}

function EmptyState({ onNova }: { onNova?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <MessageSquare className="h-7 w-7" />
      </div>
      <h2 className="text-base font-semibold text-foreground">Nenhuma conversa ainda</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Comece uma nova conversa com um colega.
      </p>
      {onNova && (
        <Button onClick={onNova} className="mt-2 gap-2">
          <Plus className="h-4 w-4" />
          Nova conversa
        </Button>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  embedded,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  embedded: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? embedded
            ? "bg-primary text-primary-foreground"
            : "bg-white text-primary"
          : embedded
            ? "bg-surface-muted text-muted-foreground hover:bg-accent"
            : "bg-white/15 text-header-foreground hover:bg-white/25",
      )}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
            active
              ? embedded
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary text-primary-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
