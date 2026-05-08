import { useEffect, useMemo, useState } from "react";
import { Link, useMatch, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase, type MensagemInterna, type Profile } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { UserAvatar } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, MessageSquare, Plus, PenSquare, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { NovaConversaDialog } from "@/components/NovaConversaDialog";
import { usePresence } from "@/hooks/usePresence";
import { MessageTicks } from "@/components/MessageTicks";
import {
  mensagensSelectColumns,
  MENSAGENS_BASE_COLUMNS,
  resetMensagensColumnsCache,
} from "@/lib/mensagensColumns";
import { makeConversaId } from "@/lib/conversa";

type GrupoRow = {
  id: string;
  nome: string;
  participantes: string[];
  created_at: string;
};

type Conversation =
  | {
      kind: "dm";
      key: string; // conversa_id 1:1
      otherId: string;
      profile: Profile | null;
      lastMessage: MensagemInterna;
      unread: number;
    }
  | {
      kind: "group";
      key: string; // conversa_id `grupo_<id>`
      groupId: string;
      nome: string;
      participantes: string[];
      lastMessage: MensagemInterna | null;
      lastDate: string;
      unread: number;
      lastAllRead: boolean;
    };

interface Props {
  embedded?: boolean;
  showEmptyCta?: boolean;
}

export function ConversasSidebar({ embedded = false, showEmptyCta = true }: Props) {
  const { user } = useAuth();
  const { otherId: activeOtherId } = useParams<{ otherId: string }>();
  const groupMatch = useMatch("/grupos/:groupId");
  const activeGroupId = groupMatch?.params.groupId ?? null;

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MensagemInterna[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [grupos, setGrupos] = useState<Record<string, GrupoRow>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "nao_lidas">("todas");
  const [novaOpen, setNovaOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const onlineIds = usePresence();

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);
      const orFilter = `remetente_id.eq.${user!.id},destinatario_id.eq.${user!.id}`;

      async function runQuery(cols: string) {
        return supabase
          .from("mensagens_internas")
          .select(cols)
          .or(orFilter)
          .not("conversa_id", "like", "demanda_%")
          .not("conversa_id", "like", "ponte_%")
          .order("created_at", { ascending: false })
          .limit(500);
      }

      const cols = await mensagensSelectColumns();
      let res = await runQuery(cols);

      if (
        res.error &&
        (res.error.code === "42703" ||
          /editada_em|apagada_em/.test(res.error.message ?? ""))
      ) {
        console.warn("[ConversasSidebar] colunas extras ausentes, refazendo com base", res.error);
        resetMensagensColumnsCache();
        res = await runQuery(MENSAGENS_BASE_COLUMNS);
      }

      if (!active) return;
      if (res.error) {
        console.error("[ConversasSidebar] erro carregando mensagens", res.error);
        setLoadError(
          `${res.error.code ?? "erro"}: ${res.error.message ?? "Falha ao carregar"}`,
        );
        setLoading(false);
        return;
      }
      const msgs = ((res.data ?? []) as unknown) as MensagemInterna[];
      setMessages(msgs);

      // Profiles para 1:1
      const otherIds = Array.from(
        new Set(
          msgs
            .filter((m) => !m.conversa_id?.startsWith("grupo_"))
            .map((m) => (m.remetente_id === user!.id ? m.destinatario_id : m.remetente_id)),
        ),
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

      // Grupos onde o usuário é participante
      const { data: gruposMembro, error: gErr } = await supabase
        .from("conversas_grupo")
        .select("id, nome, participantes, created_at")
        .contains("participantes", [user!.id]);

      if (active && !gErr && gruposMembro) {
        const gmap: Record<string, GrupoRow> = {};
        for (const g of gruposMembro as unknown as GrupoRow[]) gmap[g.id] = g;

        // Garantir grupos referenciados em mensagens mas não retornados (raro — sem RLS deveria pegar)
        const idsEmMsg = Array.from(
          new Set(
            msgs
              .filter((m) => m.conversa_id?.startsWith("grupo_"))
              .map((m) => m.conversa_id!.slice(6)),
          ),
        );
        const faltantes = idsEmMsg.filter((id) => !gmap[id]);
        if (faltantes.length) {
          const { data: extras } = await supabase
            .from("conversas_grupo")
            .select("id, nome, participantes, created_at")
            .in("id", faltantes);
          if (extras) {
            for (const g of extras as unknown as GrupoRow[]) gmap[g.id] = g;
          }
        }
        setGrupos(gmap);
      } else if (gErr) {
        console.warn("[ConversasSidebar] não foi possível carregar grupos", gErr);
        setGrupos({});
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversas_grupo" },
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

    // Mensagens — agrupar por conversa_id (grupo_) ou pelo par 1:1
    for (const m of messages) {
      const cid = m.conversa_id;
      const isGroup = !!cid && cid.startsWith("grupo_");
      if (isGroup) {
        const groupId = cid!.slice(6);
        const key = cid!;
        const isUnread = m.destinatario_id === user.id && !m.lida;
        const existing = map.get(key);
        if (!existing) {
          const g = grupos[groupId];
          if (!g) continue; // grupo inacessível — pular
          map.set(key, {
            kind: "group",
            key,
            groupId,
            nome: g.nome,
            participantes: g.participantes,
            lastMessage: m,
            lastDate: m.created_at,
            unread: isUnread ? 1 : 0,
            lastAllRead: false,
          });
        } else if (existing.kind === "group") {
          if (isUnread) existing.unread += 1;
          // mensagens vêm desc — primeira vista é a mais recente
        }
      } else {
        const otherId = m.remetente_id === user.id ? m.destinatario_id : m.remetente_id;
        const key = cid && cid.length > 0 ? cid : makeConversaId(user.id, otherId);
        const isUnread = m.destinatario_id === user.id && !m.lida;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            kind: "dm",
            key,
            otherId,
            profile: profiles[otherId] ?? null,
            lastMessage: m,
            unread: isUnread ? 1 : 0,
          });
        } else if (existing.kind === "dm" && isUnread) {
          existing.unread += 1;
        }
      }
    }

    // Grupos sem mensagens — incluir como placeholder
    for (const g of Object.values(grupos)) {
      const key = `grupo_${g.id}`;
      if (map.has(key)) continue;
      map.set(key, {
        kind: "group",
        key,
        groupId: g.id,
        nome: g.nome,
        participantes: g.participantes,
        lastMessage: null,
        lastDate: g.created_at,
        unread: 0,
        lastAllRead: false,
      });
    }


    // Para grupos: lida_por_todos = todas as cópias do último broadcast estão lidas
    for (const c of map.values()) {
      if (c.kind !== "group" || !c.lastMessage) continue;
      const last = c.lastMessage;
      const sec = new Date(last.created_at).toISOString().slice(0, 19);
      const copias = messages.filter(
        (m) =>
          m.conversa_id === c.key &&
          m.remetente_id === last.remetente_id &&
          (m.conteudo ?? "") === (last.conteudo ?? "") &&
          (m.anexo_url ?? "") === (last.anexo_url ?? "") &&
          new Date(m.created_at).toISOString().slice(0, 19) === sec,
      );
      c.lastAllRead = copias.length > 0 && copias.every((m) => m.lida);
    }

    let list = Array.from(map.values());
    if (filter === "nao_lidas") {
      list = list.filter((c) => c.unread > 0);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        if (c.kind === "group") {
          return (
            c.nome.toLowerCase().includes(q) ||
            (c.lastMessage?.conteudo ?? "").toLowerCase().includes(q)
          );
        }
        return (
          c.profile?.nome?.toLowerCase().includes(q) ||
          c.profile?.email?.toLowerCase().includes(q) ||
          c.lastMessage.conteudo.toLowerCase().includes(q)
        );
      });
    }

    function dateOf(c: Conversation) {
      return c.kind === "group" ? c.lastDate : c.lastMessage.created_at;
    }
    return list.sort(
      (a, b) => new Date(dateOf(b)).getTime() - new Date(dateOf(a)).getTime(),
    );
  }, [messages, profiles, grupos, user, search, filter]);

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
          <EmptyState
            onNova={showEmptyCta ? () => setNovaOpen(true) : undefined}
            reason={
              !user
                ? "Sem sessão ativa. Faça login novamente."
                : loadError
                  ? `Erro ao carregar conversas (${loadError})`
                  : null
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => {
              if (c.kind === "group") {
                const isActive = activeGroupId === c.groupId;
                const last = c.lastMessage;
                return (
                  <li key={c.key}>
                    <Link
                      to={`/grupos/${c.groupId}`}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors",
                        isActive ? "bg-accent" : "hover:bg-surface-muted",
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Users className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate font-semibold text-foreground">
                            {c.nome}
                          </p>
                          <time className="shrink-0 text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(c.lastDate), {
                              locale: ptBR,
                              addSuffix: false,
                            })}
                          </time>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {last && last.remetente_id === user?.id && !last.apagada_em && (
                            <MessageTicks status="sent" className="shrink-0" />
                          )}
                          <p
                            className={cn(
                              "truncate text-sm",
                              !last
                                ? "italic text-muted-foreground"
                                : c.unread > 0
                                  ? "font-medium text-foreground"
                                  : "text-muted-foreground",
                            )}
                          >
                            {!last
                              ? "Grupo criado — envie a primeira mensagem"
                              : last.apagada_em
                                ? "🚫 Mensagem apagada"
                                : last.conteudo
                                  || (last.anexo_tipo?.startsWith("image/")
                                    ? "📷 Foto"
                                    : last.anexo_url
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
              }
              const isActive = activeOtherId === c.otherId;
              return (
                <li key={c.key}>
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

function EmptyState({ onNova, reason }: { onNova?: () => void; reason?: string | null }) {
  const isError = !!reason;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <MessageSquare className="h-7 w-7" />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        {isError ? "Não foi possível carregar" : "Nenhuma conversa ainda"}
      </h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        {reason ?? "Comece uma nova conversa com um colega."}
      </p>
      {isError && (
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="mt-2"
        >
          Tentar novamente
        </Button>
      )}
      {!isError && onNova && (
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
