import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase, type MensagemInterna, type Profile } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { makeConversaId } from "@/lib/conversa";

function formatDayLabel(d: Date) {
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export default function ConversaDetail() {
  const { otherId } = useParams<{ otherId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<MensagemInterna[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !otherId) return;
    let active = true;

    async function load() {
      const [{ data: msgs }, { data: prof }] = await Promise.all([
        supabase
          .from("mensagens_internas")
          .select("id,conversa_id,remetente_id,destinatario_id,conteudo,lida,created_at")
          .or(
            `and(remetente_id.eq.${user!.id},destinatario_id.eq.${otherId}),and(remetente_id.eq.${otherId},destinatario_id.eq.${user!.id})`,
          )
          .order("created_at", { ascending: true })
          .limit(500),
        supabase
          .from("profiles")
          .select("id,nome,email,cargo,setor_id,avatar_url,ativo")
          .eq("id", otherId!)
          .maybeSingle(),
      ]);

      if (!active) return;
      setMessages((msgs ?? []) as MensagemInterna[]);
      setOther((prof ?? null) as Profile | null);
      setLoading(false);

      // Marcar mensagens recebidas como lidas
      const unread = (msgs ?? []).filter(
        (m) => m.destinatario_id === user!.id && !m.lida,
      );
      if (unread.length > 0) {
        await supabase
          .from("mensagens_internas")
          .update({ lida: true })
          .in("id", unread.map((m) => m.id));
      }
    }

    void load();

    const channel = supabase
      .channel(`chat-${user.id}-${otherId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens_internas" },
        (payload) => {
          const m = payload.new as MensagemInterna;
          const involves =
            (m.remetente_id === user.id && m.destinatario_id === otherId) ||
            (m.remetente_id === otherId && m.destinatario_id === user.id);
          if (!involves) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user, otherId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const conteudo = text.trim();
    if (!conteudo || !user || !otherId) return;

    const conversaId = makeConversaId(user.id, otherId);

    setSending(true);
    const optimistic: MensagemInterna = {
      id: `tmp-${crypto.randomUUID()}`,
      conversa_id: conversaId,
      remetente_id: user.id,
      destinatario_id: otherId,
      conteudo,
      lida: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");

    const { data, error } = await supabase
      .from("mensagens_internas")
      .insert({
        conversa_id: conversaId,
        remetente_id: user.id,
        destinatario_id: otherId,
        conteudo,
      })
      .select("id,conversa_id,remetente_id,destinatario_id,conteudo,lida,created_at")
      .single();

    setSending(false);

    if (error) {
      toast.error("Não foi possível enviar a mensagem");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(conteudo);
      return;
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === optimistic.id ? (data as MensagemInterna) : m)),
    );
  }

  // Agrupar por dia para inserir separadores
  const grouped: { day: string; items: MensagemInterna[] }[] = [];
  for (const m of messages) {
    const day = formatDayLabel(new Date(m.created_at));
    const last = grouped[grouped.length - 1];
    if (last?.day === day) last.items.push(m);
    else grouped.push({ day, items: [m] });
  }

  return (
    <div className="flex h-full flex-col bg-surface-muted">
      <header className="flex items-center gap-3 bg-gradient-header px-3 py-2.5 pt-safe text-header-foreground shadow-elevated">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="text-header-foreground hover:bg-white/10"
        >
          <Link to="/" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <UserAvatar nome={other?.nome} email={other?.email} url={other?.avatar_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">
            {other?.nome || other?.email || "Conversa"}
          </p>
          {other?.cargo && (
            <p className="truncate text-[11px] leading-tight text-white/75">{other.cargo}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="hidden text-header-foreground hover:bg-white/10 md:inline-flex"
          onClick={() => navigate("/")}
        >
          Fechar
        </Button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin px-3 py-4 md:px-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <p className="mx-auto mt-10 max-w-xs text-center text-sm text-muted-foreground">
            Diga olá! Esta é a primeira mensagem com{" "}
            <span className="font-medium text-foreground">
              {other?.nome || other?.email || "este contato"}
            </span>
            .
          </p>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-1">
            {grouped.map((g) => (
              <div key={g.day} className="flex flex-col gap-1">
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-soft">
                    {g.day}
                  </span>
                </div>
                {g.items.map((m) => {
                  const mine = m.remetente_id === user?.id;
                  return (
                    <div key={m.id} className={cn("flex animate-slide-up", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[78%] px-3 py-2 text-sm shadow-soft md:max-w-[60%]",
                          mine ? "bubble-out" : "bubble-in",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                        <p
                          className={cn(
                            "mt-1 text-right text-[10px]",
                            mine ? "text-foreground/55" : "text-muted-foreground",
                          )}
                        >
                          {format(new Date(m.created_at), "HH:mm")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={send}
        className="flex items-end gap-2 border-t border-border bg-surface px-3 py-2 pb-safe md:px-6"
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(e as unknown as FormEvent);
            }
          }}
          placeholder="Escreva uma mensagem"
          rows={1}
          className="max-h-32 min-h-[40px] resize-none rounded-2xl border-border bg-surface-muted"
        />
        <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full" disabled={sending || !text.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
