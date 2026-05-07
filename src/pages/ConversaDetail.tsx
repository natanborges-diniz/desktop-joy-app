import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  supabase,
  ANEXOS_BUCKET,
  type MensagemInterna,
  type Profile,
} from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Camera,
  FileText,
  Loader2,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { MessageTicks } from "@/components/MessageTicks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { makeConversaId } from "@/lib/conversa";
import { usePresence } from "@/hooks/usePresence";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";

const MAX_FILE_MB = 10;
const ACCEPTED_TYPES = "image/*,application/pdf";

function formatDayLabel(d: Date) {
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

function isImage(tipo?: string | null) {
  return !!tipo && tipo.startsWith("image/");
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onlineIds = usePresence();
  const isOtherOnline = otherId ? onlineIds.has(otherId) : false;
  const { otherTyping, sendTyping } = useTypingIndicator(user?.id, otherId);

  useEffect(() => {
    if (!user || !otherId) return;
    let active = true;

    async function load() {
      const [{ data: msgs }, { data: prof }] = await Promise.all([
        supabase
          .from("mensagens_internas")
          .select(
            "id,conversa_id,remetente_id,destinatario_id,conteudo,lida,created_at,anexo_url,anexo_tipo",
          )
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
          setMessages((prev) => {
            // Já existe pelo id real → ignorar.
            if (prev.some((x) => x.id === m.id)) return prev;
            // Mensagem própria que ainda está como otimista (id "tmp-...") →
            // substituir a tmp correspondente pela versão real, sem duplicar.
            if (m.remetente_id === user.id) {
              const idx = prev.findIndex(
                (x) =>
                  x.id.startsWith("tmp-") &&
                  x.remetente_id === m.remetente_id &&
                  x.destinatario_id === m.destinatario_id &&
                  (x.conteudo ?? "") === (m.conteudo ?? "") &&
                  (x.anexo_tipo ?? null) === (m.anexo_tipo ?? null),
              );
              if (idx !== -1) {
                const next = prev.slice();
                next[idx] = m;
                return next;
              }
            }
            return [...prev, m];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "mensagens_internas" },
        (payload) => {
          const m = payload.new as MensagemInterna;
          const involves =
            (m.remetente_id === user.id && m.destinatario_id === otherId) ||
            (m.remetente_id === otherId && m.destinatario_id === user.id);
          if (!involves) return;
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, lida: m.lida } : x)),
          );
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

  // Limpar preview blob quando trocar/remover arquivo
  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permitir reescolher o mesmo arquivo
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande. Máximo ${MAX_FILE_MB}MB.`);
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  function clearPending() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  }

  async function uploadAnexo(file: File, senderId: string) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${senderId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(ANEXOS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(ANEXOS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, tipo: file.type };
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const conteudo = text.trim();

    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
    const senderId = session?.user?.id ?? user?.id;

    if ((!conteudo && !pendingFile) || !senderId || !otherId) return;

    const conversaId = makeConversaId(senderId, otherId);
    const fileToSend = pendingFile;
    const previewUrl = pendingPreview;

    setSending(true);

    const optimistic: MensagemInterna = {
      id: `tmp-${crypto.randomUUID()}`,
      conversa_id: conversaId,
      remetente_id: senderId,
      destinatario_id: otherId,
      conteudo: conteudo || (fileToSend ? "" : ""),
      lida: false,
      created_at: new Date().toISOString(),
      anexo_url: fileToSend && previewUrl ? previewUrl : null,
      anexo_tipo: fileToSend?.type ?? null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    setPendingFile(null);
    setPendingPreview(null);

    let anexo_url: string | null = null;
    let anexo_tipo: string | null = null;

    if (fileToSend) {
      try {
        const up = await uploadAnexo(fileToSend, senderId);
        anexo_url = up.url;
        anexo_tipo = up.tipo;
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setText(conteudo);
        setPendingFile(fileToSend);
        setPendingPreview(previewUrl);
        setSending(false);
        toast.error("Falha ao enviar o anexo.");
        return;
      }
    }

    const { data, error } = await supabase
      .from("mensagens_internas")
      .insert({
        conversa_id: conversaId,
        remetente_id: senderId,
        destinatario_id: otherId,
        conteudo,
        anexo_url,
        anexo_tipo,
      })
      .select(
        "id,conversa_id,remetente_id,destinatario_id,conteudo,lida,created_at,anexo_url,anexo_tipo",
      )
      .single();

    setSending(false);

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(conteudo);
      toast.error("Não foi possível enviar a mensagem. Tente novamente.");
      return;
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === optimistic.id ? (data as MensagemInterna) : m)),
    );
  }

  // Agrupar por dia
  const grouped: { day: string; items: MensagemInterna[] }[] = [];
  for (const m of messages) {
    const day = formatDayLabel(new Date(m.created_at));
    const last = grouped[grouped.length - 1];
    if (last?.day === day) last.items.push(m);
    else grouped.push({ day, items: [m] });
  }

  const canSend = (!!text.trim() || !!pendingFile) && !sending;

  return (
    <div className="flex h-full flex-col bg-surface-muted">
      <header className="bg-gradient-header pt-[max(env(safe-area-inset-top),0.75rem)] text-header-foreground shadow-elevated">
        <div className="flex items-center gap-2 px-2 py-2.5">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full bg-white/20 text-header-foreground hover:bg-white/30 active:bg-white/40 md:hidden"
          >
            <Link to="/" aria-label="Voltar">
              <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
            </Link>
          </Button>
          <UserAvatar
            nome={other?.nome}
            email={other?.email}
            url={other?.avatar_url}
            size="sm"
            online={isOtherOnline}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">
              {other?.nome || other?.email || "Conversa"}
            </p>
            <p className="truncate text-[11px] leading-tight text-white/75">
              {otherTyping
                ? "digitando…"
                : isOtherOnline
                  ? "online"
                  : other?.cargo || ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-header-foreground hover:bg-white/10 md:inline-flex"
            onClick={() => navigate("/")}
          >
            Fechar
          </Button>
        </div>
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
                  const hasAnexo = !!m.anexo_url;
                  return (
                    <div key={m.id} className={cn("flex animate-slide-up", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[70%] overflow-hidden px-3 py-2 text-sm shadow-soft md:max-w-[55%]",
                          mine ? "bubble-out" : "bubble-in",
                        )}
                      >
                        {hasAnexo && isImage(m.anexo_tipo) && (
                          <a
                            href={m.anexo_url!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mb-1 block -mx-1 -mt-1"
                          >
                            <img
                              src={m.anexo_url!}
                              alt="Anexo"
                              loading="lazy"
                              className="max-h-72 w-full rounded-lg object-cover"
                            />
                          </a>
                        )}
                        {hasAnexo && !isImage(m.anexo_tipo) && (
                          <a
                            href={m.anexo_url!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "mb-1 flex items-center gap-2 rounded-lg p-2 text-xs underline-offset-2 hover:underline",
                              mine ? "bg-foreground/5" : "bg-surface-muted",
                            )}
                          >
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">Abrir anexo</span>
                          </a>
                        )}
                        {m.conteudo && (
                          <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                        )}
                        <p
                          className={cn(
                            "mt-1 flex items-center justify-end gap-1 text-[10px]",
                            mine ? "text-foreground/55" : "text-muted-foreground",
                          )}
                        >
                          <span>{format(new Date(m.created_at), "HH:mm")}</span>
                          {mine && (
                            <MessageTicks
                              status={m.id.startsWith("tmp-") ? "pending" : m.lida ? "read" : "sent"}
                              className="ml-0.5"
                            />
                          )}
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

      {/* Preview do anexo pendente */}
      {pendingFile && (
        <div className="border-t border-border bg-surface px-3 py-2 md:px-6">
          <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-border bg-surface-muted p-2">
            {pendingPreview ? (
              <img
                src={pendingPreview}
                alt="Pré-visualização"
                className="h-14 w-14 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <FileText className="h-6 w-6" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{pendingFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(pendingFile.size / 1024).toFixed(0)} KB
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearPending}
              aria-label="Remover anexo"
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <form
        onSubmit={send}
        className="flex items-end gap-2 border-t border-border bg-surface px-3 py-2 pb-safe md:px-6"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={handleFileSelected}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelected}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Anexar arquivo"
          disabled={sending}
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground md:hidden"
          onClick={() => cameraInputRef.current?.click()}
          aria-label="Tirar foto"
          disabled={sending}
        >
          <Camera className="h-5 w-5" />
        </Button>

        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.length > 0) sendTyping();
          }}
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
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          disabled={!canSend}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
