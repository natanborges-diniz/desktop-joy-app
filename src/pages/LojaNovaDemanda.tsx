import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Camera,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { supabase, SOLICITACAO_ANEXOS_BUCKET } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useLojaContext } from "@/hooks/useLojaContext";
import { useLojasAtivas } from "@/hooks/useLojasAtivas";
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

type EtapaInput =
  | "texto"
  | "decimal"
  | "inteiro"
  | "cpf"
  | "documento"
  | "imagem"
  | "texto_prefilled"
  | "loja";
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

type CpfAprovado = {
  id: string;
  protocolo: string | null;
  cpf: string | null;
  cliente: string | null;
  valor: number | string | null;
  created_at: string;
};

type Resultado = {
  status: string;
  solicitacao_id: string;
  protocolo: string;
  tipo: string;
  url?: string;
  payment_link_id?: string;
  cliente_envio_status?: "enviado" | "falhou" | "pulado";
  cliente_envio_erro?: string | null;
};

const CAMPOS_TRAVADOS_BOLETO = new Set(["cpf", "cliente", "valor"]);

function mascararCpf(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length !== 11) return raw ?? "";
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

export function parseValorBR(input: string | number | null | undefined): number {
  if (input == null) return NaN;
  if (typeof input === "number") return input;
  const limpo = String(input).trim().replace(/[R$\s]/g, "");
  if (!limpo) return NaN;
  if (limpo.includes(",")) {
    return Number(limpo.replace(/\./g, "").replace(",", "."));
  }
  return Number(limpo);
}

function formatarBRL(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseValorBR(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}


const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_POR_ETAPA = 10;

// Heurística: alguns fluxos legados não têm `tipo_input: "imagem"` ou `"loja"`
// configurado no JSON, mas o nome do campo deixa claro a intenção. Detectamos
// pelo nome para que o wizard renderize o controle certo automaticamente.
const CAMPOS_IMAGEM = /(anexo|comprovante|foto|imagem|nota_fiscal|cupom|recibo|documento_foto|print|arquivo)/i;
// Reconhece qualquer campo que contenha "loja", "filial", "unidade" ou "setor"
// como substring — cobre variações como "loja_da_despesa", "qual_loja", "de_qual_loja", etc.
const CAMPOS_LOJA = /(loja|filial|unidade|setor)/i;
// Mensagens (label/mensagem) que indicam pergunta sobre loja, mesmo com campo genérico
const MSG_LOJA = /(qual\s+(a\s+)?loja|de\s+que\s+loja|de\s+qual\s+loja|loja\s+(da|do|de))/i;

function tipoEfetivo(et: Etapa): EtapaInput {
  if (et.tipo_input === "imagem" || et.tipo_input === "loja" || et.tipo_input === "texto_prefilled")
    return et.tipo_input;
  if (CAMPOS_IMAGEM.test(et.campo)) return "imagem";
  if (CAMPOS_LOJA.test(et.campo)) return "loja";
  const txt = `${et.label ?? ""} ${et.mensagem ?? ""}`;
  if (MSG_LOJA.test(txt)) return "loja";
  return et.tipo_input;
}

function validar(et: Etapa, raw: string): string | null {
  const v = (raw ?? "").trim();
  if (tipoEfetivo(et) === "loja") {
    if (et.obrigatorio !== false && !v) return "Selecione uma loja";
    return null;
  }
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
  if (et.campo === "cliente_whatsapp") {
    const d = v.replace(/\D/g, "");
    if (d.length < 10 || d.length > 13) return "Informe DDD + número (10–13 dígitos)";
  }
  if (et.tipo_input === "texto" || et.tipo_input === "texto_prefilled") {
    if (val.min_length != null && v.length < val.min_length) return `Mínimo ${val.min_length} caracteres`;
    if (val.max_length != null && v.length > val.max_length) return `Máximo ${val.max_length} caracteres`;
  }
  return null;
}

export default function LojaNovaDemanda() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lojaNome, codEmpresa, tipoUsuario, isLoja, loading: ctxLoading } = useLojaContext();
  const { data: lojasAtivas = [] } = useLojasAtivas();

  const [opcoes, setOpcoes] = useState<MenuOpcao[]>([]);
  const [trilha, setTrilha] = useState<MenuOpcao[]>([]);
  const [fluxoAtivo, setFluxoAtivo] = useState<Fluxo | null>(null);
  const [dados, setDados] = useState<Record<string, string>>({});
  const [anexos, setAnexos] = useState<Record<string, Anexo[]>>({});
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [profileNome, setProfileNome] = useState<string>("");
  const [cpfsAprovados, setCpfsAprovados] = useState<CpfAprovado[] | null>(null);
  const [carregandoCpfs, setCarregandoCpfs] = useState(false);
  const [consultaCpfSelecionada, setConsultaCpfSelecionada] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Opção de menu para o fluxo "consulta_cpf" (usada pelo card de bloqueio do boleto)
  const opcaoConsultaCpf = useMemo(
    () => opcoes.find((o) => o.tipo === "fluxo" && o.fluxo === "consulta_cpf") ?? null,
    [opcoes],
  );

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

  // Resolve nome do solicitante a partir do profile (vazio se for pessoa final)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive) return;
      const n = (data as { nome: string | null } | null)?.nome ?? "";
      if (n) setProfileNome(n);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

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
    const fluxo = data as Fluxo;
    // Pré-preenche etapas texto_prefilled e loja (usa tipo efetivo para fluxos legados)
    const initial: Record<string, string> = {};
    for (const et of fluxo.etapas ?? []) {
      const tef = tipoEfetivo(et);
      if (tef === "texto_prefilled" && profileNome) {
        initial[et.campo] = profileNome;
      }
      if (tef === "loja" && lojaNome) {
        initial[et.campo] = lojaNome;
      }
    }
    setFluxoAtivo(fluxo);
    setDados(initial);
    setAnexos({});
    setErros({});
    setConsultaCpfSelecionada(null);
    setCpfsAprovados(null);
    setRevisando(false);

    // Fluxo "gerar_boleto": só permite seguir com base em uma consulta_cpf aprovada
    if (fluxo.chave === "gerar_boleto" && lojaNome) {
      void carregarCpfsAprovados(lojaNome);
    }
  }

  async function carregarCpfsAprovados(loja: string) {
    setCarregandoCpfs(true);
    const desdeIso = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("solicitacoes")
      .select("id,protocolo,created_at,metadata")
      .eq("tipo", "consulta_cpf")
      .eq("metadata->>resultado_consulta", "aprovado")
      .eq("metadata->>loja_nome", loja)
      .is("metadata->>boleto_solicitacao_id", null)
      .gte("created_at", desdeIso)
      .order("created_at", { ascending: false })
      .limit(50);
    setCarregandoCpfs(false);
    if (error) {
      toast.error("Falha ao carregar consultas de CPF aprovadas");
      setCpfsAprovados([]);
      return;
    }
    setCpfsAprovados(
      (data ?? []).map((r: any) => {
        const m = r?.metadata ?? {};
        return {
          id: r.id,
          protocolo: r.protocolo ?? null,
          cpf: m.cpf ?? null,
          cliente: m.cliente ?? m.nome_cliente ?? null,
          valor: m.valor_aprovado ?? m.valor ?? null,
          created_at: r.created_at,
        };
      }),
    );
  }


  // Se lojaNome/profileNome chegarem DEPOIS do fluxo ser aberto, sincroniza.
  useEffect(() => {
    if (!fluxoAtivo) return;
    setDados((d) => {
      const next = { ...d };
      let changed = false;
      for (const et of fluxoAtivo.etapas ?? []) {
        const tef = tipoEfetivo(et);
        if (tef === "loja" && lojaNome && !next[et.campo]) {
          next[et.campo] = lojaNome;
          changed = true;
        }
        if (tef === "texto_prefilled" && profileNome && !next[et.campo]) {
          next[et.campo] = profileNome;
          changed = true;
        }
      }
      return changed ? next : d;
    });
  }, [fluxoAtivo, lojaNome, profileNome]);


  function escolherCpfAprovado(c: CpfAprovado) {
    setConsultaCpfSelecionada(c.id);
    setDados((d) => ({
      ...d,
      cpf: c.cpf ?? d.cpf ?? "",
      cliente: c.cliente ?? d.cliente ?? "",
      valor: c.valor != null ? String(c.valor) : (d.valor ?? ""),
    }));
    setErros((e) => ({ ...e, cpf: null, cliente: null, valor: null }));
  }

  function voltar() {
    if (resultado) {
      setResultado(null);
      setFluxoAtivo(null);
      setConsultaCpfSelecionada(null);
      setCpfsAprovados(null);
      setRevisando(false);
      return;
    }
    if (revisando) {
      setRevisando(false);
      return;
    }
    if (fluxoAtivo) {
      setFluxoAtivo(null);
      setConsultaCpfSelecionada(null);
      setCpfsAprovados(null);
      return;
    }
    setTrilha((t) => t.slice(0, -1));
  }

  async function uploadAnexo(et: Etapa, file: File) {
    if (!user) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`"${file.name}" excede 10 MB`);
      return;
    }
    const atuais = anexos[et.campo] ?? [];
    if (atuais.length >= MAX_FILES_POR_ETAPA) {
      toast.error(`Máximo ${MAX_FILES_POR_ETAPA} arquivos por campo`);
      return;
    }
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const path = `solicitacoes/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${et.campo}.${ext}`;
    const { error } = await supabase.storage
      .from(SOLICITACAO_ANEXOS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      toast.error(`Falha ao enviar "${file.name}"`);
      return;
    }
    const { data } = supabase.storage.from(SOLICITACAO_ANEXOS_BUCKET).getPublicUrl(path);
    setAnexos((a) => ({
      ...a,
      [et.campo]: [
        ...(a[et.campo] ?? []),
        { url: data.publicUrl, mime_type: file.type, nome: file.name },
      ],
    }));
    setErros((e) => ({ ...e, [et.campo]: null }));
  }

  async function uploadVarios(et: Etapa, files: FileList | File[]) {
    for (const f of Array.from(files)) {
      await uploadAnexo(et, f);
    }
  }

  function removerAnexo(campo: string, idx: number) {
    setAnexos((a) => {
      const arr = (a[campo] ?? []).slice();
      arr.splice(idx, 1);
      return { ...a, [campo]: arr };
    });
  }

  function irParaRevisao() {
    if (!fluxoAtivo) return;

    if (fluxoAtivo.chave === "gerar_boleto" && !consultaCpfSelecionada) {
      toast.error("Selecione uma Consulta de CPF aprovada");
      return;
    }

    const novosErros: Record<string, string | null> = {};
    for (const et of fluxoAtivo.etapas) {
      if (
        fluxoAtivo.chave === "gerar_boleto" &&
        consultaCpfSelecionada &&
        CAMPOS_TRAVADOS_BOLETO.has(et.campo)
      ) {
        novosErros[et.campo] = null;
        continue;
      }
      if (tipoEfetivo(et) === "imagem") {
        if (et.obrigatorio !== false && !(anexos[et.campo]?.length))
          novosErros[et.campo] = "Anexe ao menos um arquivo";
        else novosErros[et.campo] = null;
      } else {
        novosErros[et.campo] = validar(et, dados[et.campo] ?? "");
      }
    }
    setErros(novosErros);
    if (Object.values(novosErros).some(Boolean)) {
      toast.error("Corrija os campos destacados antes de revisar");
      return;
    }
    setRevisando(true);
  }

  async function enviar() {
    if (!fluxoAtivo) return;

    setEnviando(true);
    const dadosEnvio: Record<string, string> = { ...dados };
    if (fluxoAtivo.chave === "gerar_boleto" && consultaCpfSelecionada) {
      dadosEnvio.consulta_cpf_id = consultaCpfSelecionada;
    }
    const payload: Record<string, unknown> = {
      fluxo_chave: fluxoAtivo.chave,
      dados: dadosEnvio,
      anexos: Object.values(anexos).flat(),
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
    setRevisando(false);
    toast.success(`Solicitação ${(data as Resultado).protocolo} aberta!`);
  }

  function copiar(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copiado!"),
      () => toast.error("Não foi possível copiar"),
    );
  }

  const titulo = resultado
    ? "Solicitação enviada"
    : revisando
      ? "Revisar antes de enviar"
      : fluxoAtivo
        ? `${fluxoAtivo.nome}`
        : nivelAtual
          ? `${nivelAtual.emoji ?? ""} ${nivelAtual.titulo}`
          : "Nova demanda";

  function formatarValorEtapa(et: Etapa, raw: string | undefined): string {
    const v = (raw ?? "").trim();
    const tef = tipoEfetivo(et);
    if (!v && tef !== "imagem") return "—";
    if (et.tipo_input === "cpf") return mascararCpf(v);
    if (et.tipo_input === "documento") {
      const d = v.replace(/\D/g, "");
      if (d.length === 11) return mascararCpf(v);
      return v;
    }
    if (et.tipo_input === "decimal" || et.campo === "valor") return formatarBRL(v);
    return v;
  }

  const lojaTravada = !!lojaNome && (tipoUsuario === "loja" || tipoUsuario === "colaborador");

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

                  {resultado.payment_link_id && resultado.cliente_envio_status === "enviado" && (
                    <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                      ✅ Link enviado por WhatsApp para o cliente.
                    </div>
                  )}
                  {resultado.payment_link_id && resultado.cliente_envio_status === "falhou" && (
                    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                      ⚠️ Link gerado, mas não foi possível enviar ao cliente automaticamente
                      {resultado.cliente_envio_erro ? ` (${resultado.cliente_envio_erro})` : ""}.
                      Copie e envie manualmente.
                    </div>
                  )}
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
          ) : fluxoAtivo && revisando ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
                Confira os dados antes de enviar. Se algo estiver errado, volte e edite.
              </div>

              {fluxoAtivo.chave === "gerar_boleto" && consultaCpfSelecionada && cpfsAprovados && (() => {
                const sel = cpfsAprovados.find((x) => x.id === consultaCpfSelecionada);
                if (!sel) return null;
                return (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      CPF aprovado selecionado
                    </span>
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {sel.cliente ?? "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          CPF {mascararCpf(sel.cpf)} · aprovado em{" "}
                          {formatarDataCurta(sel.created_at)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-primary">
                        {formatarBRL(sel.valor)}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-soft">
                {fluxoAtivo.etapas.map((et) => {
                  const label = et.label ?? et.mensagem ?? et.campo;
                  const tef = tipoEfetivo(et);
                  const arquivos = anexos[et.campo] ?? [];
                  return (
                    <div key={et.campo} className="px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      {tef === "imagem" ? (
                        arquivos.length === 0 ? (
                          <p className="mt-0.5 text-sm text-muted-foreground">—</p>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {arquivos.map((a, i) =>
                              a.mime_type?.startsWith("image/") ? (
                                <img
                                  key={i}
                                  src={a.url}
                                  alt={a.nome}
                                  className="h-14 w-14 rounded-md border border-border object-cover"
                                />
                              ) : (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  {a.nome}
                                </span>
                              ),
                            )}
                          </div>
                        )
                      ) : (
                        <p className="mt-0.5 break-words text-sm text-foreground">
                          {formatarValorEtapa(et, dados[et.campo])}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setRevisando(false)}
                  disabled={enviando}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar e editar
                </Button>
                <Button
                  className="w-full flex-1"
                  onClick={enviar}
                  disabled={enviando}
                >
                  {enviando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Confirmar e gerar
                </Button>
              </div>
            </div>
          ) : fluxoAtivo ? (
            <div className="space-y-4">
              {/* === Fluxo gerar_boleto: bloqueio / seleção de CPF aprovado === */}
              {fluxoAtivo.chave === "gerar_boleto" && (
                <>
                  {carregandoCpfs || cpfsAprovados === null ? (
                    <div className="flex items-center justify-center rounded-xl border border-border bg-card p-6">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="ml-2 text-sm text-muted-foreground">
                        Buscando consultas de CPF aprovadas…
                      </span>
                    </div>
                  ) : cpfsAprovados.length === 0 ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                      <h3 className="mb-1 text-sm font-semibold text-foreground">
                        Nenhuma Consulta de CPF aprovada disponível
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Para gerar boleto é preciso ter uma Consulta de CPF aprovada
                        pelo financeiro nos últimos 60 dias.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {opcaoConsultaCpf && (
                          <Button onClick={() => entrar(opcaoConsultaCpf)}>
                            Solicitar Consulta de CPF
                          </Button>
                        )}
                        <Button variant="outline" onClick={voltar}>
                          Voltar
                        </Button>
                      </div>
                    </div>
                  ) : !consultaCpfSelecionada ? (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
                      <h3 className="mb-3 text-sm font-semibold text-foreground">
                        Selecione o CPF aprovado para este boleto
                      </h3>
                      <ul className="space-y-2">
                        {cpfsAprovados.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => escolherCpfAprovado(c)}
                              className="w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {c.cliente ?? "—"}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    CPF {mascararCpf(c.cpf)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-primary">
                                    {formatarBRL(c.valor)}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    aprovado em {formatarDataCurta(c.created_at)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    (() => {
                      const sel = cpfsAprovados.find((x) => x.id === consultaCpfSelecionada);
                      if (!sel) return null;
                      return (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                              CPF aprovado selecionado
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setConsultaCpfSelecionada(null);
                                setDados((d) => ({ ...d, cpf: "", cliente: "", valor: "" }));
                              }}
                              className="text-xs text-muted-foreground underline hover:text-foreground"
                            >
                              Trocar
                            </button>
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {sel.cliente ?? "—"}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                CPF {mascararCpf(sel.cpf)} · aprovado em{" "}
                                {formatarDataCurta(sel.created_at)}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-primary">
                              {formatarBRL(sel.valor)}
                            </p>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </>
              )}

              {(fluxoAtivo.chave !== "gerar_boleto" || consultaCpfSelecionada) &&
                fluxoAtivo.etapas.map((et) => {
                  const erro = erros[et.campo];
                  const label = et.label ?? et.mensagem ?? et.campo;
                  const tef = tipoEfetivo(et);
                  const travadoBoleto =
                    fluxoAtivo.chave === "gerar_boleto" &&
                    !!consultaCpfSelecionada &&
                    CAMPOS_TRAVADOS_BOLETO.has(et.campo);
                  if (travadoBoleto) {
                    return (
                      <div key={et.campo} className="space-y-1.5">
                        <label className="block whitespace-pre-wrap text-sm font-medium text-foreground">
                          {label}
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            value={
                              et.campo === "valor"
                                ? formatarBRL(dados[et.campo])
                                : et.campo === "cpf"
                                  ? mascararCpf(dados[et.campo])
                                  : (dados[et.campo] ?? "")
                            }
                            readOnly
                            className="flex-1"
                          />
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            do CPF aprovado
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return (
                  <div key={et.campo} className="space-y-1.5">
                    <label className="block whitespace-pre-wrap text-sm font-medium text-foreground">
                      {label}
                    </label>

                    {tef === "imagem" ? (
                      <div className="space-y-2">
                        <input
                          ref={(el) => (fileRefs.current[`${et.campo}__camera`] = el)}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadAnexo(et, f);
                            e.target.value = "";
                          }}
                        />
                        <input
                          ref={(el) => (fileRefs.current[`${et.campo}__file`] = el)}
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const fs = e.target.files;
                            if (fs && fs.length) void uploadVarios(et, fs);
                            e.target.value = "";
                          }}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileRefs.current[`${et.campo}__camera`]?.click()}
                          >
                            <Camera className="mr-2 h-4 w-4" />
                            {anexos[et.campo]?.length ? "Tirar outra foto" : "Tirar foto"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileRefs.current[`${et.campo}__file`]?.click()}
                          >
                            <Paperclip className="mr-2 h-4 w-4" />
                            Anexar arquivo
                          </Button>
                          <span className="text-[11px] text-muted-foreground">
                            Imagens ou PDF · até 10 MB cada
                          </span>
                        </div>

                        {!!anexos[et.campo]?.length && (
                          <ul className="space-y-1.5">
                            {anexos[et.campo].map((ax, idx) => {
                              const isImg = ax.mime_type?.startsWith("image/");
                              const isPdf = ax.mime_type === "application/pdf";
                              return (
                                <li
                                  key={`${ax.url}-${idx}`}
                                  className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2"
                                >
                                  <a href={ax.url} target="_blank" rel="noreferrer" className="block">
                                    {isImg ? (
                                      <img
                                        src={ax.url}
                                        alt={ax.nome}
                                        className="h-12 w-12 rounded object-cover"
                                      />
                                    ) : isPdf ? (
                                      <div className="flex h-12 w-12 items-center justify-center rounded bg-background">
                                        <FileText className="h-6 w-6 text-primary" />
                                      </div>
                                    ) : (
                                      <div className="flex h-12 w-12 items-center justify-center rounded bg-background">
                                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                      </div>
                                    )}
                                  </a>
                                  <a
                                    href={ax.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex-1 truncate text-xs text-primary underline"
                                  >
                                    {ax.nome}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => removerAnexo(et.campo, idx)}
                                    className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    aria-label="Remover"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : tef === "loja" ? (
                      lojaTravada ? (
                        <div className="flex items-center gap-2">
                          <Input value={dados[et.campo] ?? lojaNome ?? ""} readOnly className="flex-1" />
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            minha loja
                          </span>
                        </div>
                      ) : (
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                          value={dados[et.campo] ?? ""}
                          onChange={(e) =>
                            setDados((d) => ({ ...d, [et.campo]: e.target.value }))
                          }
                        >
                          <option value="">Selecione uma loja…</option>
                          {lojasAtivas.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      )
                    ) : tef === "texto_prefilled" ? (
                      <Input
                        value={dados[et.campo] ?? ""}
                        onChange={(e) =>
                          setDados((d) => ({ ...d, [et.campo]: e.target.value }))
                        }
                      />
                    ) : et.tipo_input === "texto" && (et.validacao?.max_length ?? 0) > 120 ? (
                      <Textarea
                        rows={4}
                        value={dados[et.campo] ?? ""}
                        onChange={(e) =>
                          setDados((d) => ({ ...d, [et.campo]: e.target.value }))
                        }
                      />
                    ) : et.campo === "cliente_whatsapp" ? (
                      <div className="space-y-1">
                        <Input
                          type="tel"
                          inputMode="tel"
                          placeholder="(11) 91234-5678"
                          value={dados[et.campo] ?? ""}
                          onChange={(e) =>
                            setDados((d) => ({ ...d, [et.campo]: e.target.value }))
                          }
                        />
                        <p className="text-[11px] text-muted-foreground">
                          DDD + número (10 a 13 dígitos). O link será enviado por WhatsApp.
                        </p>
                      </div>
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

              {(fluxoAtivo.chave !== "gerar_boleto" || consultaCpfSelecionada) && (
                <Button
                  className="w-full"
                  onClick={irParaRevisao}
                  disabled={
                    enviando ||
                    (fluxoAtivo.chave === "gerar_boleto" && !consultaCpfSelecionada)
                  }
                >
                  <ChevronRight className="mr-2 h-4 w-4" />
                  Revisar dados
                </Button>
              )}
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
