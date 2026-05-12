import { useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent } from "react";
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
  Ban,
  Check,
  FileText,
  Loader2,
  MoreVertical,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { MessageTicks } from "@/components/MessageTicks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  hasEditDeleteColumns,
  mensagensSelectColumns,
  MENSAGENS_BASE_COLUMNS,
  resetMensagensColumnsCache,
} from "@/lib/mensagensColumns";

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
  criado_por: string | null;
};

type ProfileLite = {
  id: string;
  nome: string | null;
  email: string | null;
  cargo: string | null;
};

// Visão "agregada" de um broadcast em grupo: 1 logical message representando N cópias.
type GroupMessage = MensagemInterna & {
  copias_ids: string[];
  destinatarios_ids: string[];
  leitores_ids: string[];
  lidas_count: number;
  total_copias: number;
  lida_por_todos: boolean;
};

function dedupGroup(messages: MensagemInterna[]): GroupMessage[] {
  const groups = new Map<string, MensagemInterna[]>();
  for (const m of messages) {
    const key = `${m.remetente_id}|${m.conteudo ?? ""}|${m.anexo_url ?? ""}|${new Date(m.created_at).toISOString().slice(0, 19)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  const out: GroupMessage[] = [];
  for (const copias of groups.values()) {
    const base = copias[0];
    const leitores = copias.filter((c) => c.lida).map((c) => c.destinatario_id);
    const destinatarios = copias.map((c) => c.destinatario_id);
    out.push({
      ...base,
      copias_ids: copias.map((c) => c.id),
      destinatarios_ids: destinatarios,
      leitores_ids: leitores,
      lidas_count: leitores.length,
      total_copias: copias.length,
      lida_por_todos: copias.length > 0 && copias.every((c) => c.lida),
    });
  }
  out.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return out;
}

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
  const [editAvailable, setEditAvailable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Editar / apagar
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Carregar grupo + mensagens
  useEffect(() => {
    if (!user || !groupId || !conversaId) return;
    let active = true;

    async function load() {
      setLoading(true);
      const { data: g, error: gErr } = await supabase
        .from("conversas_grupo")
        .select("id, nome, participantes, criado_por")
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

      // Mensagens — tentar com colunas extras (editada_em/apagada_em)
      const cols = await mensagensSelectColumns();
      async function fetchMsgs(c: string) {
        return supabase
          .from("mensagens_internas")
          .select(c)
          .eq("conversa_id", conversaId!)
          .order("created_at", { ascending: true })
          .limit(2000);
      }
      let res = await fetchMsgs(cols);
      if (
        res.error &&
        (res.error.code === "42703" ||
          /editada_em|apagada_em/.test(res.error.message ?? ""))
      ) {
        resetMensagensColumnsCache();
        res = await fetchMsgs(MENSAGENS_BASE_COLUMNS);
      }
      if (active) setEditAvailable(await hasEditDeleteColumns());

      if (!active) return;
      if (res.error) {
        console.error("[GrupoChat] erro carregando mensagens", res.error);
      }
      const msgsArr = ((res.data ?? []) as unknown) as MensagemInterna[];
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

  // Dedup → 1 mensagem lógica por broadcast
  const dedup = useMemo<GroupMessage[]>(() => dedupGroup(messages), [messages]);

  // Agrupar por dia
  const grouped: { day: string; items: GroupMessage[] }[] = [];
  for (const m of dedup) {
    const day = formatDayLabel(new Date(m.created_at));
    const last = grouped[grouped.length - 1];
    if (last?.day === day) last.items.push(m);
    else grouped.push({ day, items: [m] });
  }

  const canSend = (!!text.trim() || !!pendingFile) && !sending;

  function startEdit(m: GroupMessage) {
    setEditingKey(m.id);
    setEditingText(m.conteudo ?? "");
  }
  function cancelEdit() {
    setEditingKey(null);
    setEditingText("");
  }

  // Editar todas as cópias do broadcast (mesmo remetente, mesmo conteúdo, janela de 2s)
  async function saveEdit(m: GroupMessage) {
    const novo = editingText.trim();
    if (!novo) {
      toast.error("A mensagem não pode ficar vazia.");
      return;
    }
    if (novo === (m.conteudo ?? "")) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    const nowIso = new Date().toISOString();
    const t = new Date(m.created_at).getTime();
    const lo = new Date(t - 2000).toISOString();
    const hi = new Date(t + 2000).toISOString();

    const { error } = await supabase
      .from("mensagens_internas")
      .update({ conteudo: novo, editada_em: nowIso })
      .eq("conversa_id", conversaId!)
      .eq("remetente_id", m.remetente_id)
      .eq("conteudo", m.conteudo ?? "")
      .gte("created_at", lo)
      .lte("created_at", hi);

    setSavingEdit(false);
    if (error) {
      toast.error("Não foi possível editar. Tente novamente.");
      return;
    }
    // Atualização otimista local; UPDATE do realtime também chegará
    setMessages((prev) =>
      prev.map((x) =>
        m.copias_ids.includes(x.id) ? { ...x, conteudo: novo, editada_em: nowIso } : x,
      ),
    );
    cancelEdit();
  }

  function extrairPathDoAnexo(url: string): string | null {
    const marker = `/object/public/${ANEXOS_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.slice(idx + marker.length));
  }

  async function confirmarApagar() {
    if (!confirmDeleteKey) return;
    const m = dedup.find((x) => x.id === confirmDeleteKey);
    if (!m) {
      setConfirmDeleteKey(null);
      return;
    }
    setDeleting(true);
    const nowIso = new Date().toISOString();
    const t = new Date(m.created_at).getTime();
    const lo = new Date(t - 2000).toISOString();
    const hi = new Date(t + 2000).toISOString();

    if (m.anexo_url) {
      const path = extrairPathDoAnexo(m.anexo_url);
      if (path) {
        try {
          await supabase.storage.from(ANEXOS_BUCKET).remove([path]);
        } catch {
          /* ignore */
        }
      }
    }

    const { error } = await supabase
      .from("mensagens_internas")
      .update({
        apagada_em: nowIso,
        conteudo: "",
        anexo_url: null,
        anexo_tipo: null,
      })
      .eq("conversa_id", conversaId!)
      .eq("remetente_id", m.remetente_id)
      .eq("conteudo", m.conteudo ?? "")
      .gte("created_at", lo)
      .lte("created_at", hi);

    setDeleting(false);
    setConfirmDeleteKey(null);
    if (error) {
      toast.error("Não foi possível apagar. Tente novamente.");
      return;
    }
    setMessages((prev) =>
      prev.map((x) =>
        m.copias_ids.includes(x.id)
          ? { ...x, apagada_em: nowIso, conteudo: "", anexo_url: null, anexo_tipo: null }
          : x,
      ),
    );
  }

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
            {grupo && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="truncate text-left text-[11px] leading-tight text-white/75 hover:underline">
                    {grupo.participantes.length} participantes
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-2">
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    Participantes ({grupo.participantes.length})
                  </p>
                  <div className="max-h-72 overflow-y-auto pr-1">
                    {grupo.participantes.map((pid) => (
                      <div
                        key={pid}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <span className="truncate">{nomes[pid] || "Usuário"}</span>
                        {pid === user?.id && (
                          <span className="text-[10px] text-muted-foreground">(você)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
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
                  const apagada = !!m.apagada_em;
                  const hasAnexo = !!m.anexo_url && !apagada;
                  const senderName = nomes[m.remetente_id] || "Usuário";
                  const isEditing = editingKey === m.id;
                  const podeAcoes = mine && !apagada && editAvailable;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "group flex animate-slide-up items-center gap-1",
                        mine ? "justify-end" : "justify-start",
                      )}
                    >
                      {mine && podeAcoes && !isEditing && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Ações da mensagem"
                              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground opacity-100 transition hover:bg-surface md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="top">
                            {(m.conteudo ?? "").trim().length > 0 && (
                              <DropdownMenuItem onSelect={() => startEdit(m)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onSelect={() => setConfirmDeleteKey(m.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Apagar mensagem
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <div
                        className={cn(
                          "max-w-[75%] overflow-hidden px-3 py-2 text-sm shadow-soft md:max-w-[60%]",
                          mine ? "bubble-out" : "bubble-in",
                          apagada && "italic opacity-70",
                        )}
                      >
                        {!mine && !apagada && (
                          <p className="mb-0.5 text-[11px] font-semibold text-primary">
                            {senderName}
                          </p>
                        )}
                        {apagada ? (
                          <p className="flex items-center gap-1.5 text-muted-foreground">
                            <Ban className="h-3.5 w-3.5" />
                            Mensagem apagada
                          </p>
                        ) : isEditing ? (
                          <div className="flex flex-col gap-2">
                            <Textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  void saveEdit(m);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelEdit();
                                }
                              }}
                              autoFocus
                              rows={2}
                              className="min-w-[220px] resize-none rounded-lg border-border bg-background text-foreground"
                            />
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={cancelEdit}
                                disabled={savingEdit}
                                className="h-7 px-2"
                              >
                                <X className="h-3.5 w-3.5" /> Cancelar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void saveEdit(m)}
                                disabled={savingEdit}
                                className="h-7 px-2"
                              >
                                {savingEdit ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}{" "}
                                Salvar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
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
                          </>
                        )}
                        <p
                          className={cn(
                            "mt-1 flex items-center justify-end gap-1 text-[10px]",
                            mine ? "text-foreground/55" : "text-muted-foreground",
                          )}
                        >
                          {!apagada && m.editada_em && !isEditing && (
                            <span className="italic">editada</span>
                          )}
                          <span>{format(new Date(m.created_at), "HH:mm")}</span>
                          {mine && !apagada && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="Ver quem leu"
                                  className="ml-0.5 inline-flex items-center gap-1 rounded-sm hover:underline"
                                >
                                  <MessageTicks
                                    status={m.lida_por_todos ? "read" : "sent"}
                                  />
                                  <span className="text-[11px] font-medium underline decoration-dotted underline-offset-2">
                                    {m.lidas_count}/{m.total_copias}
                                  </span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-56 p-2">
                                <p className="mb-2 px-1 text-xs font-medium">
                                  Visualizações
                                </p>
                                <div className="max-h-64 space-y-1 overflow-y-auto">
                                  {m.destinatarios_ids.map((pid) => {
                                    const leu = m.leitores_ids.includes(pid);
                                    return (
                                      <div
                                        key={pid}
                                        className="flex items-center justify-between px-1 py-0.5 text-xs"
                                      >
                                        <span className="truncate">
                                          {nomes[pid] || "Usuário"}
                                        </span>
                                        {leu ? (
                                          <span className="text-sky-500" aria-label="Lida">
                                            ✓✓
                                          </span>
                                        ) : (
                                          <span
                                            className="text-muted-foreground"
                                            aria-label="Pendente"
                                          >
                                            ○
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </PopoverContent>
                            </Popover>
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
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          disabled={!canSend}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      <AlertDialog
        open={confirmDeleteKey !== null}
        onOpenChange={(o) => !o && !deleting && setConfirmDeleteKey(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem será apagada para você e para todos os participantes do grupo.
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmarApagar();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
