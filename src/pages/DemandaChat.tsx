// Fluxo B — chat de uma demanda (todas as lojas participantes veem)
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Paperclip, Send, Users, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase, ANEXOS_BUCKET } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useLojaContext } from "@/hooks/useLojaContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Demanda = {
  id: string;
  numero_curto: string | null;
  assunto: string | null;
  pergunta: string | null;
  status: string | null;
  loja_nome: string | null;
  metadata: Record<string, unknown> | null;
};

type DemandaMsg = {
  id: string;
  demanda_id: string;
  direcao: "loja_para_operador" | "operador_para_loja" | string;
  autor_id: string | null;
  autor_nome: string | null;
  conteudo: string | null;
  anexo_url: string | null;
  anexo_mime: string | null;
  created_at: string;
};

export default function DemandaChat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lojaNome } = useLojaContext();
  const [demanda, setDemanda] = useState<Demanda | null>(null);
  const [msgs, setMsgs] = useState<DemandaMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [anexo, setAnexo] = useState<{ url: string; mime: string; nome: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    const [{ data: d }, { data: m }] = await Promise.all([
      supabase
        .from("demandas_loja")
        .select("id,numero_curto,assunto,pergunta,status,loja_nome,metadata")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("demanda_mensagens")
        .select("*")
        .eq("demanda_id", id)
        .order("created_at"),
    ]);
    setDemanda((d as Demanda) ?? null);
    setMsgs((m ?? []) as DemandaMsg[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [id]);

  // Marca mensagens do operador como vistas pela loja (✓✓ no painel do operador)
  useEffect(() => {
    if (!id || !user) return;
    const nowIso = new Date().toISOString();
    // 1) Atualiza demanda (compat com versão antiga + UI loja)
    void supabase
      .from("demandas_loja")
      .update({
        visto_pela_loja_at: nowIso,
        visto_por_loja_user_id: user.id,
      })
      .eq("id", id);
    // 2) Marca cada mensagem do operador ainda não vista (chave do ✓✓ no Atrium)
    void supabase
      .from("demanda_mensagens")
      .update({
        visto_pela_loja_at: nowIso,
        visto_por_loja_user_id: user.id,
      })
      .eq("demanda_id", id)
      .eq("direcao", "operador_para_loja")
      .is("visto_pela_loja_at", null);
  }, [id, user?.id, msgs.length]); // re-roda quando chega msg nova do operador

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`demanda-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "demanda_mensagens",
          filter: `demanda_id=eq.${id}`,
        },
        (payload) => setMsgs((curr) => [...curr, payload.new as DemandaMsg]),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "demandas_loja",
          filter: `id=eq.${id}`,
        },
        (payload) => setDemanda((curr) => ({ ...(curr as Demanda), ...(payload.new as Demanda) })),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id]);

  // auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  async function normalizarImagem(file: File): Promise<{ blob: Blob; ext: string; mime: string; nome: string }> {
    // Converte qualquer imagem (incl. HEIC do iPhone) para JPEG redimensionado.
    // Mantém arquivos não-imagem como vieram.
    const ehImagem =
      file.type.startsWith("image/") ||
      /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(file.name);
    if (!ehImagem) {
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
      return { blob: file, ext, mime: file.type || "application/octet-stream", nome: file.name };
    }
    const bitmap = await createImageBitmap(file);
    const MAX = 1600;
    const ratio = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao converter imagem"))), "image/jpeg", 0.85),
    );
    const baseNome = file.name.replace(/\.[^.]+$/, "");
    return { blob, ext: "jpg", mime: "image/jpeg", nome: `${baseNome}.jpg` };
  }

  async function uploadAnexo(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const { blob, ext, mime, nome } = await normalizarImagem(file);
      const path = `${user.id}/demandas/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from(ANEXOS_BUCKET)
        .upload(path, blob, { contentType: mime, upsert: false });
      if (error) {
        console.error("[uploadAnexo] erro:", error);
        toast.error(`Falha ao enviar anexo: ${error.message ?? "erro desconhecido"}`);
        return;
      }
      const { data } = supabase.storage.from(ANEXOS_BUCKET).getPublicUrl(path);
      setAnexo({ url: data.publicUrl, mime, nome });
    } catch (e: any) {
      console.error("[uploadAnexo] exceção:", e);
      toast.error(`Falha ao processar anexo: ${e?.message ?? "erro desconhecido"}`);
    } finally {
      setUploading(false);
    }
  }

  async function enviar() {
    if (!id || !user || (!texto.trim() && !anexo)) return;
    setEnviando(true);
    const conteudo = texto.trim();
    const { error: errMsg } = await supabase.from("demanda_mensagens").insert({
      demanda_id: id,
      direcao: "loja_para_operador",
      autor_id: user.id,
      autor_nome: lojaNome ?? "Loja",
      conteudo,
      anexo_url: anexo?.url ?? null,
      anexo_mime: anexo?.mime ?? null,
    });
    if (errMsg) {
      setEnviando(false);
      toast.error("Não foi possível enviar");
      return;
    }
    await supabase
      .from("demandas_loja")
      .update({
        status: "respondida",
        ultima_mensagem_loja_at: new Date().toISOString(),
        vista_pelo_operador: false,
      })
      .eq("id", id);
    setTexto("");
    setAnexo(null);
    setEnviando(false);
  }

  const grupo = (demanda?.metadata as any)?.grupo === true;
  const lojas: string[] = (demanda?.metadata as any)?.lojas_nomes ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-3 pt-safe text-header-foreground">
        <div className="flex h-14 items-center gap-2 md:h-16">
          <button
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="rounded-full p-1.5 hover:bg-white/15"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold md:text-lg">
              {demanda?.assunto ?? demanda?.numero_curto ?? "Demanda"}
            </h1>
            <p className="truncate text-xs text-white/80">
              {grupo ? (
                <>
                  <Users className="mr-1 inline h-3 w-3" /> Grupo · {lojas.length} lojas
                </>
              ) : (
                demanda?.numero_curto ?? ""
              )}
            </p>
          </div>
        </div>
        {grupo && lojas.length > 0 && (
          <div className="flex flex-wrap gap-1 pb-2">
            {lojas.slice(0, 6).map((n) => (
              <span
                key={n}
                className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium"
              >
                {n}
              </span>
            ))}
            {lojas.length > 6 && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium">
                +{lojas.length - 6}
              </span>
            )}
          </div>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin bg-surface-muted p-3">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-2">
            {demanda?.pergunta && (
              <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-soft">
                <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                  Operador
                </p>
                <p className="whitespace-pre-wrap">{demanda.pergunta}</p>
              </div>
            )}
            {msgs.map((m) => {
              const eh_operador = m.direcao === "operador_para_loja";
              const meu = !eh_operador && m.autor_id === user?.id;
              const align = meu ? "justify-end" : "justify-start";
              const bubble = meu
                ? "bg-primary text-primary-foreground"
                : eh_operador
                  ? "bg-card text-foreground border border-border"
                  : "bg-accent text-accent-foreground";
              return (
                <div key={m.id} className={`flex ${align}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-soft ${bubble}`}>
                    {!meu && (
                      <p className="mb-0.5 text-[11px] font-semibold opacity-80">
                        {eh_operador ? "Operador" : (m.autor_nome ?? "Loja")}
                      </p>
                    )}
                    {m.conteudo && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                    {m.anexo_url && (
                      <a
                        href={m.anexo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block break-all text-[11px] underline opacity-90"
                      >
                        📎 anexo
                      </a>
                    )}
                    <p className="mt-1 text-[10px] opacity-70">
                      {format(new Date(m.created_at), "d MMM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card p-2">
        {anexo && (
          <div className="mx-auto mb-2 flex max-w-2xl items-center justify-between rounded-md bg-muted px-3 py-1.5 text-xs">
            <span className="truncate">📎 {anexo.nome}</span>
            <button onClick={() => setAnexo(null)} aria-label="Remover anexo">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAnexo(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={1}
            placeholder="Mensagem"
            className="min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
          />
          <Button
            onClick={enviar}
            disabled={enviando || (!texto.trim() && !anexo)}
            size="icon"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
