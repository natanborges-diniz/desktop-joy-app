import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, MessageSquarePlus, Send } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useLojaContext } from "@/hooks/useLojaContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

type Solicitacao = {
  id: string;
  protocolo: string | null;
  assunto: string | null;
  status: string | null;
  created_at: string;
  pipeline_coluna_id: string | null;
  pipeline_colunas?:
    | { nome: string | null; cor: string | null }
    | { nome: string | null; cor: string | null }[]
    | null;
};

type Comentario = {
  id: string;
  solicitacao_id: string;
  tipo: string | null;
  conteudo: string;
  autor_nome: string | null;
  autor_id: string | null;
  created_at: string;
  anexo_url?: string | null;
  anexo_nome?: string | null;
  anexo_mime?: string | null;
  metadata?: Record<string, unknown> | null;
};

export default function LojaMinhasDemandas() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { lojaNome, podeMenuLoja, loading: ctxLoading } = useLojaContext();

  const [items, setItems] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState<Solicitacao | null>(null);

  async function load() {
    if (!lojaNome) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("solicitacoes")
      .select(
        "id, protocolo, assunto, status, created_at, pipeline_coluna_id, pipeline_colunas(nome,cor)",
      )
      .eq("metadata->>alias_loja", lojaNome)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Solicitacao[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [lojaNome]);

  // realtime na lista
  useEffect(() => {
    if (!lojaNome) return;
    const ch = supabase
      .channel(`lista-sol-${lojaNome}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "solicitacoes" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [lojaNome]);

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center justify-between md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Minhas demandas</h1>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={() => navigate("/nova-demanda")}
          >
            <MessageSquarePlus className="h-4 w-4" /> Nova
          </Button>
        </div>
        <p className="pb-3 text-sm text-white/80">
          {lojaNome ? `Loja: ${lojaNome}` : "—"}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {ctxLoading || loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !podeMenuLoja ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Apenas lojas/colaboradores acessam esta área.
          </p>
        ) : items.length === 0 ? (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Você ainda não abriu nenhuma demanda.
            </p>
            <Button onClick={() => navigate("/nova-demanda")}>Abrir nova demanda</Button>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-3xl gap-3">
            {items.map((s) => (
              <li key={s.id}>
                <Card
                  className="cursor-pointer p-4 shadow-soft transition-shadow hover:shadow-elevated"
                  onClick={() => setAberta(s)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                        {s.protocolo ?? "—"}
                      </span>
                      <h2 className="mt-1 truncate font-semibold text-foreground">
                        {s.assunto ?? "Sem assunto"}
                      </h2>
                      {(() => {
                        const col = Array.isArray(s.pipeline_colunas)
                          ? s.pipeline_colunas[0]
                          : s.pipeline_colunas;
                        if (!col?.nome) return null;
                        return (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: col.cor ?? "#94a3b8" }}
                            />
                            {col.nome}
                          </p>
                        );
                      })()}
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase text-muted-foreground">
                      {s.status ?? "—"}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {format(new Date(s.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {aberta && (
            <DetalheSolicitacao
              solicitacao={aberta}
              user={user}
              profileNome={profile?.nome ?? "Loja"}
              onClose={() => setAberta(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetalheSolicitacao({
  solicitacao,
  user,
  profileNome,
  onClose,
}: {
  solicitacao: Solicitacao;
  user: { id: string } | null;
  profileNome: string;
  onClose: () => void;
}) {
  const [coments, setComents] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("solicitacao_comentarios")
      .select(
        "id, solicitacao_id, autor_id, autor_nome, conteudo, tipo, created_at, anexo_url, anexo_nome, anexo_mime, metadata",
      )
      .eq("solicitacao_id", solicitacao.id)
      .order("created_at");
    setComents((data ?? []) as Comentario[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`sol-${solicitacao.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "solicitacao_comentarios",
          filter: `solicitacao_id=eq.${solicitacao.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitacao.id]);

  async function enviar() {
    if (!texto.trim() || !user) return;
    setEnviando(true);
    const { error } = await supabase.from("solicitacao_comentarios").insert({
      solicitacao_id: solicitacao.id,
      tipo: "interno",
      conteudo: texto.trim(),
      autor_id: user.id,
      autor_nome: profileNome,
    });
    setEnviando(false);
    if (error) {
      toast.error("Não foi possível enviar");
      return;
    }
    setTexto("");
  }

  return (
    <>
      <SheetHeader className="border-b border-border bg-gradient-header px-4 py-3 text-header-foreground">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1 hover:bg-white/15"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <SheetTitle className="text-base text-header-foreground">
            {solicitacao.protocolo ?? "Solicitação"}
          </SheetTitle>
        </div>
        <p className="ml-7 truncate text-xs text-white/80">{solicitacao.assunto ?? "—"}</p>
      </SheetHeader>

      <div className="flex-1 space-y-3 overflow-y-auto scroll-thin bg-surface-muted p-3">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : coments.length === 0 ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Sem comentários ainda.
          </p>
        ) : (
          coments.map((c) => {
            const meu = c.autor_id === user?.id;
            return (
              <div
                key={c.id}
                className={`flex ${meu ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-soft ${
                    meu
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground"
                  }`}
                >
                  {!meu && (
                    <p className="mb-0.5 text-[11px] font-semibold opacity-80">
                      {c.autor_nome ?? "Operador"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{c.conteudo}</p>
                  <p className="mt-1 text-[10px] opacity-70">
                    {format(new Date(c.created_at), "d MMM HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border bg-card p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder="Escreva um comentário..."
            className="min-h-[44px] resize-none"
          />
          <Button onClick={enviar} disabled={enviando || !texto.trim()} size="icon">
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
