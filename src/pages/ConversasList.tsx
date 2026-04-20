import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

type Conversation = {
  otherId: string;
  profile: Profile | null;
  lastMessage: MensagemInterna;
  unread: number;
};

export default function ConversasList() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MensagemInterna[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("mensagens_internas")
        .select("id,remetente_id,destinatario_id,conteudo,lida,created_at,tipo,anexo_url")
        .or(`remetente_id.eq.${user!.id},destinatario_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!active) return;
      if (error) {
        setLoading(false);
        return;
      }
      const msgs = (data ?? []) as MensagemInterna[];
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

    // Realtime: quando uma nova mensagem chega ou é atualizada, recarrega.
    const channel = supabase
      .channel("conversas-list")
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
  }, [messages, profiles, user, search]);

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center justify-between md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Conversas</h1>
        </div>
        <div className="relative pb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-[calc(50%+6px)] text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar conversas"
            className="border-0 bg-white/95 pl-9 text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-white/50"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => (
              <li key={c.otherId}>
                <Link
                  to={`/conversas/${c.otherId}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                >
                  <UserAvatar
                    nome={c.profile?.nome}
                    email={c.profile?.email}
                    url={c.profile?.avatar_url}
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
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "truncate text-sm",
                          c.unread > 0
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {c.lastMessage.remetente_id === user?.id ? "Você: " : ""}
                        {c.lastMessage.conteudo}
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <MessageSquare className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Nenhuma conversa ainda</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Quando você ou um colega trocar a primeira mensagem, ela aparecerá aqui.
      </p>
    </div>
  );
}
