import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  supabase,
  ANEXOS_BUCKET,
  type MensagemInterna,
} from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Camera,
  FileText,
  Loader2,
  Paperclip,
  Send,
  Users,
  X,
} from "lucide-react";
import { MessageTicks } from "@/components/MessageTicks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MENSAGENS_BASE_COLUMNS } from "@/lib/mensagensColumns";

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

type Grupo = {
  id: string;
  nome: string;
  participantes: string[];
};

export default function GrupoChat() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const conversaId = groupId ? `grupo_${groupId}` : null;

  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<MensagemInterna[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carregar grupo + mensagens
  useEffect(() => {
    if (!user || !groupId || !conversaId) return;
    let active = true;

    async function load() {
      setLoading(true);
      const { data: g, error: gErr } = await supabase
        .from("conversas_grupo")
        .select("id, nome, participantes")
        .eq("id", groupId!)
        .maybeSingle();

      if (!active) return;
      if (gErr || !g) {
        console.error("[GrupoChat] grupo não encontrado", gErr);
        toast.error("Grupo não encontrado.");
        navigate("/", { replace: true });
        return;
      }
      const grupoData = g as unknown as Grupo;
      if (!grupoData.participantes?.includes(user!.id)) {
        toast.error("Você não faz parte desse grupo.");
        navigate("/", { replace: true });
        return;
      }
      setGrupo(grupoData);

      // Nomes dos participantes
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,nome,email")
        .in("id", grupoData.participantes);
      if (active && profs) {
        const map: Record<string, string> = {};
        for (const p of profs as Array<{ id: string; nome: string | null; email: string | null }>) {
          map[p.id] = p.nome || p.email || "Usuário";
        }
        setNomes(map);
      }

      // Mensagens
      const { data: msgs, error: mErr } = await supabase
        .from("mensagens_internas")
        .select(MENSAGENS_BASE_COLUMNS)
        .eq("conversa_id", conversaId!)
        .order("created_at", { ascending: true })
        .limit(1000);

      if (!active) return;
      if (mErr) {
        console.error("[GrupoChat] erro carregando mensagens", mErr);
      }
      const msgsArr = ((msgs ?? []) as unknown) as MensagemInterna[];
      setMessages(msgsArr);
      setLoading(false);

      // Marcar como lidas
      const unread = msgsArr.filter(
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
      .channel(`grupo-${groupId}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mensagens_internas",
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const m = payload.new as MensagemInterna;
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
          // Marcar como lida se for para mim
          if (m.destinatario_id === user.id && !m.lida) {
            void supabase
              .from("mensagens_internas")
              .update({ lida: true })
              .eq("id", m.id);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "mensagens_internas",
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const m = payload.new as MensagemInterna;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user, groupId, conversaId, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
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

    if (!user || !grupo || !conversaId) return;
    if (!conteudo && !pendingFile) return;

    const outros = grupo.participantes.filter((p) => p !== user.id);
    if (outros.length === 0) {
      toast.error("Grupo sem outros participantes.");
      return;
    }

    const fileToSend = pendingFile;
    setSending(true);

    let anexo_url: string | null = null;
    let anexo_tipo: string | null = null;

    if (fileToSend) {
      try {
        const up = await uploadAnexo(fileToSend, user.id);
        anexo_url = up.url;
        anexo_tipo = up.tipo;
      } catch (err) {
        console.error(err);
        setSending(false);
        toast.error("Falha ao enviar o anexo.");
        return;
      }
    }

    const rows = outros.map((d) => ({
      conversa_id: conversaId,
      remetente_id: user.id,
      destinatario_id: d,
      conteudo,
      anexo_url,
      anexo_tipo,
    }));

    const { error } = await supabase.from("mensagens_internas").insert(rows);
    setSending(false);

    if (error) {
      console.error("[GrupoChat] erro enviando", error);
      toast.error("Não foi possível enviar a mensagem.");
      return;
    }

    setText("");
    clearPending();
  }

  // Dedup por (remetente_id, conteudo, anexo_url, created_at até segundo)
  const dedup: MensagemInterna[] = (() => {
    const seen = new Set<string>();
    const out: MensagemInterna[] = [];
    for (const m of messages) {
      const key = `${m.remetente_id}|${m.conteudo ?? ""}|${m.anexo_url ?? ""}|${new Date(m.created_at).toISOString().slice(0, 19)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(m);
      }
    }
    return out;
  })();

  // Agrupar por dia
  const grouped: { day: string; items: MensagemInterna[] }[] = [];
  for (const m of dedup) {
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">
              {grupo?.nome || "Grupo"}
            </p>
            <p className="truncate text-[11px] leading-tight text-white/75">
              {grupo ? `${grupo.participantes.length} participantes` : ""}
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
        ) : dedup.length === 0 ? (
          <p className="mx-auto mt-10 max-w-xs text-center text-sm text-muted-foreground">
            Grupo criado. Envie a primeira mensagem para{" "}
            <span className="font-medium text-foreground">
              {grupo?.nome || "este grupo"}
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
                  const senderName = nomes[m.remetente_id] || "Usuário";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "group flex animate-slide-up items-center gap-1",
                        mine ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] overflow-hidden px-3 py-2 text-sm shadow-soft md:max-w-[60%]",
                          mine ? "bubble-out" : "bubble-in",
                        )}
                      >
                        {!mine && (
                          <p className="mb-0.5 text-[11px] font-semibold text-primary">
                            {senderName}
                          </p>
                        )}
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
                          {mine && <MessageTicks status="sent" className="ml-0.5" />}
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(e as unknown as FormEvent);
            }
          }}
          placeholder="Mensagem para o grupo"
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
