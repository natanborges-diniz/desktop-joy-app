import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  Loader2,
  Send,
} from "lucide-react";
import { supabase, SOLICITACAO_ANEXOS_BUCKET } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useLojaContext } from "@/hooks/useLojaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type MenuOpcao = {
  id: string;
  parent_id: string | null;
  tipo: "submenu" | "fluxo" | "falar_equipe" | string;
  fluxo: string | null;
  chave: string;
  titulo: string;
  emoji: string | null;
  ordem: number;
};

type EtapaInput = "texto" | "decimal" | "inteiro" | "cpf" | "documento" | "imagem";
type Etapa = {
  campo: string;
  mensagem?: string;
  label?: string;
  tipo_input: EtapaInput;
  validacao?: { min?: number; max?: number; min_length?: number; max_length?: number };
  obrigatorio?: boolean;
  opcoes?: { valor: string; rotulo: string }[];
};

type Fluxo = {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  etapas: Etapa[];
};

type Anexo = { url: string; mime_type: string; nome: string };

type Resultado = {
  status: string;
  solicitacao_id: string;
  protocolo: string;
  tipo: string;
  url?: string;
  payment_link_id?: string;
};

function validar(et: Etapa, raw: string): string | null {
  const v = (raw ?? "").trim();
  if (et.obrigatorio !== false && !v) return "Campo obrigatório";
  if (!v) return null;
  const val = et.validacao ?? {};
  if (et.tipo_input === "decimal") {
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n)) return "Informe um número válido";
    if (val.min != null && n < val.min) return `Mínimo: ${val.min}`;
    if (val.max != null && n > val.max) return `Máximo: ${val.max}`;
  }
  if (et.tipo_input === "inteiro") {
    const n = Number(v);
    if (!Number.isInteger(n)) return "Informe um número inteiro";
    if (val.min != null && n < val.min) return `Mínimo: ${val.min}`;
    if (val.max != null && n > val.max) return `Máximo: ${val.max}`;
  }
  if (et.tipo_input === "cpf") {
    const d = v.replace(/\D/g, "");
    if (d.length !== 11) return "CPF deve ter 11 dígitos";
  }
  if (et.tipo_input === "documento") {
    const d = v.replace(/\D/g, "");
    if (d.length !== 11 && d.length !== 14) return "CPF (11) ou CNPJ (14)";
  }
  if (et.tipo_input === "texto") {
    if (val.min_length != null && v.length < val.min_length) return `Mínimo ${val.min_length} caracteres`;
    if (val.max_length != null && v.length > val.max_length) return `Máximo ${val.max_length} caracteres`;
  }
  return null;
}

export default function LojaNovaDemanda() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lojaNome, codEmpresa, isLoja, loading: ctxLoading } = useLojaContext();

  const [opcoes, setOpcoes] = useState<MenuOpcao[]>([]);
  const [trilha, setTrilha] = useState<MenuOpcao[]>([]);
  const [fluxoAtivo, setFluxoAtivo] = useState<Fluxo | null>(null);
  const [dados, setDados] = useState<Record<string, string>>({});
  const [anexos, setAnexos] = useState<Record<string, Anexo>>({});
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("bot_menu_opcoes")
        .select("id,parent_id,tipo,fluxo,chave,titulo,emoji,ordem")
        .eq("tipo_bot", "loja")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (!alive) return;
      setOpcoes(((data ?? []) as MenuOpcao[]).filter((o) => o.tipo !== "falar_equipe"));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const nivelAtual = trilha[trilha.length - 1] ?? null;
  const filhos = useMemo(
    () =>
      opcoes
        .filter((o) => o.parent_id === (nivelAtual?.id ?? null))
        .sort((a, b) => a.ordem - b.ordem),
    [opcoes, nivelAtual],
  );

  async function entrar(o: MenuOpcao) {
    if (o.tipo === "submenu") {
      setTrilha((t) => [...t, o]);
      return;
    }
    if (o.tipo !== "fluxo" || !o.fluxo) {
      toast.error("Fluxo indisponível");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("bot_fluxos")
      .select("id,chave,nome,descricao,etapas")
      .eq("chave", o.fluxo ?? o.chave)
      .eq("ativo", true)
      .maybeSingle();
    setLoading(false);
    if (error || !data) {
      toast.error("Fluxo indisponível");
      return;
    }
    setFluxoAtivo(data as Fluxo);
    setDados({});
    setAnexos({});
    setErros({});
  }

  function voltar() {
    if (resultado) {
      setResultado(null);
      setFluxoAtivo(null);
      return;
    }
    if (fluxoAtivo) {
      setFluxoAtivo(null);
      return;
    }
    setTrilha((t) => t.slice(0, -1));
  }

  async function uploadImagem(et: Etapa, file: File) {
    if (!user) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `solicitacoes/${user.id}/${Date.now()}-${et.campo}.${ext}`;
    const { error } = await supabase.storage
      .from(SOLICITACAO_ANEXOS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      toast.error("Falha ao enviar imagem");
      return;
    }
    const { data } = supabase.storage.from(SOLICITACAO_ANEXOS_BUCKET).getPublicUrl(path);
    setAnexos((a) => ({
      ...a,
      [et.campo]: { url: data.publicUrl, mime_type: file.type, nome: file.name },
    }));
    setDados((d) => ({ ...d, [et.campo]: data.publicUrl }));
    setErros((e) => ({ ...e, [et.campo]: null }));
  }

  async function enviar() {
    if (!fluxoAtivo) return;
    // valida tudo
    const novosErros: Record<string, string | null> = {};
    for (const et of fluxoAtivo.etapas) {
      if (et.tipo_input === "imagem") {
        if (et.obrigatorio !== false && !anexos[et.campo]) novosErros[et.campo] = "Anexe uma imagem";
        else novosErros[et.campo] = null;
      } else {
        novosErros[et.campo] = validar(et, dados[et.campo] ?? "");
      }
    }
    setErros(novosErros);
    if (Object.values(novosErros).some(Boolean)) return;

    setEnviando(true);
    const payload: Record<string, unknown> = {
      fluxo_chave: fluxoAtivo.chave,
      dados,
      anexos: Object.values(anexos),
    };
    if (lojaNome) {
      payload.loja = { nome_loja: lojaNome, cod_empresa: codEmpresa };
    }
    const { data, error } = await supabase.functions.invoke("criar-solicitacao-loja", {
      body: payload,
    });
    setEnviando(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Falha ao abrir solicitação");
      return;
    }
    setResultado(data as Resultado);
    toast.success(`Solicitação ${(data as Resultado).protocolo} aberta!`);
  }

  function copiar(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copiado!"),
      () => toast.error("Não foi possível copiar"),
    );
  }

  // header dinâmico
  const titulo = resultado
    ? "Solicitação enviada"
    : fluxoAtivo
      ? `${fluxoAtivo.nome}`
      : nivelAtual
        ? `${nivelAtual.emoji ?? ""} ${nivelAtual.titulo}`
        : "Nova demanda";

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center gap-2 md:h-16">
          <button
            onClick={() => {
              if (resultado || fluxoAtivo || trilha.length > 0) voltar();
              else navigate(-1);
            }}
            className="rounded-full p-1.5 hover:bg-white/15"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold md:text-lg">{titulo}</h1>
            {trilha.length > 0 && !fluxoAtivo && !resultado && (
              <p className="truncate text-xs text-white/80">
                {trilha.map((t) => t.titulo).join(" › ")}
              </p>
            )}
            {fluxoAtivo?.descricao && !resultado && (
              <p className="truncate text-xs text-white/80">{fluxoAtivo.descricao}</p>
            )}
          </div>
        </div>
        <div className="pb-3" />
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin">
        <div className="mx-auto max-w-2xl p-4">
          {ctxLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !isLoja ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              Apenas usuários do tipo <strong>loja</strong> ou <strong>colaborador</strong> podem
              abrir solicitações.
            </p>
          ) : resultado ? (
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <div className="mb-3 flex items-center gap-2 text-primary">
                <Check className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Solicitação registrada</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Protocolo
                <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 font-mono text-sm font-semibold text-primary">
                  {resultado.protocolo}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tipo: {resultado.tipo} · Status: {resultado.status}
              </p>

              {resultado.url && (
                <div className="mt-4 rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Link gerado</p>
                  <p className="mt-1 break-all text-sm">{resultado.url}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copiar(resultado.url!)}>
                      <Copy className="mr-1.5 h-4 w-4" /> Copiar link
                    </Button>
                    {typeof navigator !== "undefined" && "share" in navigator && (
                      <Button
                        size="sm"
                        onClick={() =>
                          (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
                            .share({ url: resultado.url, title: resultado.protocolo })
                            .catch(() => undefined)
                        }
                      >
                        Compartilhar
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <Button variant="outline" onClick={() => navigate("/minhas-demandas")}>
                  Ver minhas demandas
                </Button>
                <Button
                  onClick={() => {
                    setResultado(null);
                    setFluxoAtivo(null);
                    setTrilha([]);
                  }}
                >
                  Abrir outra
                </Button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : fluxoAtivo ? (
            <div className="space-y-4">
              {fluxoAtivo.etapas.map((et) => {
                const erro = erros[et.campo];
                const label = et.label ?? et.mensagem ?? et.campo;
                return (
                  <div key={et.campo} className="space-y-1.5">
                    <label className="block whitespace-pre-wrap text-sm font-medium text-foreground">
                      {label}
                    </label>
                    {et.tipo_input === "imagem" ? (
                      <div className="flex items-center gap-3">
                        <input
                          ref={(el) => (fileRefs.current[et.campo] = el)}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadImagem(et, f);
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileRefs.current[et.campo]?.click()}
                        >
                          <ImageIcon className="mr-2 h-4 w-4" />
                          {anexos[et.campo] ? "Trocar imagem" : "Enviar imagem"}
                        </Button>
                        {anexos[et.campo] && (
                          <a
                            href={anexos[et.campo].url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-xs text-primary underline"
                          >
                            {anexos[et.campo].nome}
                          </a>
                        )}
                      </div>
                    ) : et.tipo_input === "texto" && (et.validacao?.max_length ?? 0) > 120 ? (
                      <Textarea
                        rows={4}
                        value={dados[et.campo] ?? ""}
                        onChange={(e) =>
                          setDados((d) => ({ ...d, [et.campo]: e.target.value }))
                        }
                      />
                    ) : (
                      <Input
                        inputMode={
                          et.tipo_input === "decimal"
                            ? "decimal"
                            : et.tipo_input === "inteiro" ||
                                et.tipo_input === "cpf" ||
                                et.tipo_input === "documento"
                              ? "numeric"
                              : "text"
                        }
                        value={dados[et.campo] ?? ""}
                        onChange={(e) =>
                          setDados((d) => ({ ...d, [et.campo]: e.target.value }))
                        }
                      />
                    )}
                    {erro && <p className="text-xs text-destructive">{erro}</p>}
                  </div>
                );
              })}

              <Button className="w-full" onClick={enviar} disabled={enviando}>
                {enviando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Enviar solicitação
              </Button>
            </div>
          ) : filhos.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              Sem opções disponíveis.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-soft">
              {filhos.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => entrar(o)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="text-xl">{o.emoji ?? "▶️"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{o.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.tipo === "submenu" ? "Categoria" : "Tipo de solicitação"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
