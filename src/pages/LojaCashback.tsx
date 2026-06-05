import { useState } from "react";
import { Loader2, Wallet, Search, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useLojaContext } from "@/hooks/useLojaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Cliente = { id: string; nome: string | null };

type ConsultaOk = {
  status: "ok";
  cliente: Cliente;
  estado_geral: "ativo" | "em_carencia" | "nenhum";
  saldo_usavel: number;
  saldo_em_carencia: number;
  proximo_vencimento: string | null;
  proxima_liberacao: string | null;
  total_usado: number;
  fator_resgate: number;
};
type ConsultaResp = ConsultaOk | { status: "nao_encontrado" };

type RegistrarOk = {
  status: "ok";
  cliente: Cliente;
  ja_processado: boolean;
  credito_gerado: { valor: number; liberado_em: string | null } & Record<string, unknown>;
  saldo_atual: number;
};
type RegistrarResp =
  | RegistrarOk
  | { status: "erro"; motivo: "trava_3x"; mensagem: string; max_desconto: number; fator_resgate: number }
  | { status: "erro"; motivo: "saldo_insuficiente"; saldo_disponivel: number; mensagem: string }
  | { status: "erro"; motivo: "valor_invalido"; mensagem: string }
  | { status: "erro"; motivo: "desconhecido"; mensagem: string };

const BRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    const d = s.length <= 10 ? parseISO(s) : new Date(s);
    return format(d, "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return s;
  }
}

function onlyDigits(s: string) {
  return s.replace(/\D+/g, "");
}

function buildIdentBody(cpf: string, telefone: string) {
  const c = onlyDigits(cpf);
  const t = onlyDigits(telefone);
  const body: { cpf?: string; telefone?: string } = {};
  if (c) body.cpf = c;
  if (t) body.telefone = t;
  return body;
}

async function invokeCashback<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("cashback-loja", { body });
  if (error) throw error;
  return data as T;
}

export default function LojaCashback() {
  const { lojaNome } = useLojaContext();

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center gap-2 md:h-16">
          <Wallet className="h-5 w-5" />
          <h1 className="text-lg font-semibold md:text-xl">Cashback</h1>
        </div>
        <p className="pb-3 text-sm text-white/80">{lojaNome ? `Loja: ${lojaNome}` : "—"}</p>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        <div className="mx-auto w-full max-w-xl">
          <Tabs defaultValue="consultar" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="consultar">Consultar saldo</TabsTrigger>
              <TabsTrigger value="registrar">Registrar venda</TabsTrigger>
            </TabsList>
            <TabsContent value="consultar" className="mt-4">
              <ConsultarTab />
            </TabsContent>
            <TabsContent value="registrar" className="mt-4">
              <RegistrarTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────── Consultar ───────────────────────────────── */

function ConsultarTab() {
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ConsultaResp | null>(null);

  async function consultar() {
    const body = buildIdentBody(cpf, telefone);
    if (!body.cpf && !body.telefone) {
      toast.error("Informe CPF ou telefone.");
      return;
    }
    setLoading(true);
    setResp(null);
    try {
      const data = await invokeCashback<ConsultaResp>({ action: "consultar", ...body });
      setResp(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao consultar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4 shadow-soft">
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cs-cpf">CPF</Label>
          <Input
            id="cs-cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
          />
        </div>
        <div className="text-center text-xs text-muted-foreground">ou</div>
        <div className="grid gap-1.5">
          <Label htmlFor="cs-tel">Telefone</Label>
          <Input
            id="cs-tel"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </div>
        <Button onClick={consultar} disabled={loading} className="mt-1 gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Consultar
        </Button>
      </div>

      {resp && (
        <div className="mt-4">
          <ResultadoConsulta resp={resp} />
        </div>
      )}
    </Card>
  );
}

function ResultadoConsulta({ resp }: { resp: ConsultaResp }) {
  if (resp.status === "nao_encontrado") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <span>Cliente não encontrado, confira o CPF/telefone.</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 text-sm text-muted-foreground">{resp.cliente?.nome ?? "Cliente"}</div>
      {resp.estado_geral === "nenhum" && (
        <div className="text-sm">Sem cashback acumulado</div>
      )}
      {(resp.estado_geral === "ativo" || resp.saldo_usavel > 0) && (
        <div className="space-y-0.5">
          <div className="text-lg font-semibold text-foreground">
            Disponível: {BRL(resp.saldo_usavel)}
          </div>
          {resp.proximo_vencimento && (
            <div className="text-xs text-muted-foreground">
              vence em {fmtDate(resp.proximo_vencimento)}
            </div>
          )}
        </div>
      )}
      {(resp.estado_geral === "em_carencia" || resp.saldo_em_carencia > 0) && (
        <div className="mt-2 space-y-0.5">
          <div className="text-sm">
            Em carência: <span className="font-semibold">{BRL(resp.saldo_em_carencia)}</span>
          </div>
          {resp.proxima_liberacao && (
            <div className="text-xs text-muted-foreground">
              libera em {fmtDate(resp.proxima_liberacao)}
            </div>
          )}
        </div>
      )}
      {resp.total_usado > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          Total já usado: {BRL(resp.total_usado)}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────── Registrar ───────────────────────────────── */

type Passo = 1 | 2 | 3 | 4;

function RegistrarTab() {
  const [passo, setPasso] = useState<Passo>(1);

  // passo 1
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");

  // resultado da consulta
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [saldoUsavel, setSaldoUsavel] = useState(0);
  const [fatorResgate, setFatorResgate] = useState(1);
  const [consultando, setConsultando] = useState(false);

  // passo 2
  const [numeroVenda, setNumeroVenda] = useState("");
  const [valorStr, setValorStr] = useState("");

  // passo 3
  const [cashbackUsar, setCashbackUsar] = useState(0);
  const [maxCashback, setMaxCashback] = useState(0);

  // passo 4
  const [enviando, setEnviando] = useState(false);
  const [okResp, setOkResp] = useState<RegistrarOk | null>(null);

  const valorNum = Number(valorStr.replace(",", "."));

  function resetTudo() {
    setPasso(1);
    setCpf("");
    setTelefone("");
    setNome("");
    setCliente(null);
    setSaldoUsavel(0);
    setFatorResgate(1);
    setNumeroVenda("");
    setValorStr("");
    setCashbackUsar(0);
    setMaxCashback(0);
    setOkResp(null);
  }

  async function avancarParaVenda() {
    const body = buildIdentBody(cpf, telefone);
    if (!body.cpf && !body.telefone) {
      toast.error("Informe CPF ou telefone.");
      return;
    }
    setConsultando(true);
    try {
      const data = await invokeCashback<ConsultaResp>({ action: "consultar", ...body });
      if (data.status === "nao_encontrado") {
        // cliente novo
        if (!nome.trim()) {
          toast.error("Cliente novo — informe o nome.");
          setConsultando(false);
          return;
        }
        setCliente({ id: "", nome: nome.trim() });
        setSaldoUsavel(0);
        setFatorResgate(1);
      } else {
        setCliente(data.cliente);
        setSaldoUsavel(data.saldo_usavel ?? 0);
        setFatorResgate(data.fator_resgate || 1);
      }
      setPasso(2);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao consultar cliente.");
    } finally {
      setConsultando(false);
    }
  }

  function avancarParaCashback() {
    if (!numeroVenda.trim()) {
      toast.error("Informe o número da venda.");
      return;
    }
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (saldoUsavel <= 0) {
      // pula passo 3
      setCashbackUsar(0);
      setMaxCashback(0);
      setPasso(4);
      return;
    }
    const max = Math.floor(Math.min(saldoUsavel, valorNum / (fatorResgate || 1)) * 100) / 100;
    setMaxCashback(max);
    setCashbackUsar(max);
    setPasso(3);
  }

  async function confirmar() {
    const body = buildIdentBody(cpf, telefone);
    setEnviando(true);
    try {
      const data = await invokeCashback<RegistrarResp>({
        action: "registrar",
        ...body,
        nome: nome.trim() || undefined,
        numero_venda: numeroVenda.trim(),
        valor_informado: valorNum,
        cashback_usado: cashbackUsar,
      });
      if (data.status === "ok") {
        setOkResp(data);
        if (data.ja_processado) {
          toast.message("Essa venda já tinha sido registrada", {
            description: "Não foi duplicada.",
          });
        }
        return;
      }
      // erros
      if (data.motivo === "trava_3x") {
        toast.error(data.mensagem);
        setMaxCashback(data.max_desconto);
        setCashbackUsar(data.max_desconto);
        setFatorResgate(data.fator_resgate || fatorResgate);
        setPasso(3);
        return;
      }
      if (data.motivo === "saldo_insuficiente") {
        toast.error(data.mensagem);
        setSaldoUsavel(data.saldo_disponivel);
        const max =
          Math.floor(Math.min(data.saldo_disponivel, valorNum / (fatorResgate || 1)) * 100) / 100;
        setMaxCashback(max);
        setCashbackUsar(max);
        setPasso(3);
        return;
      }
      if (data.motivo === "valor_invalido") {
        toast.error(data.mensagem);
        setPasso(2);
        return;
      }
      toast.error(data.mensagem || "Erro desconhecido.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao registrar venda.");
    } finally {
      setEnviando(false);
    }
  }

  if (okResp) {
    return (
      <Card className="p-5 shadow-soft">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <h2 className="text-lg font-semibold">Venda registrada!</h2>
          <p className="text-sm text-muted-foreground">
            Cashback gerado: <strong>{BRL(okResp.credito_gerado.valor)}</strong>
            {okResp.credito_gerado.liberado_em && (
              <> , libera em {fmtDate(okResp.credito_gerado.liberado_em)}.</>
            )}
          </p>
          <div className="mt-1 text-xs text-muted-foreground">
            {okResp.cliente?.nome} • Saldo atual: {BRL(okResp.saldo_atual)}
          </div>
          <Button className="mt-2 w-full" onClick={resetTudo}>
            Registrar outro
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 shadow-soft">
      <PassosIndicador passo={passo} pulaCashback={saldoUsavel <= 0 && passo >= 2} />

      {passo === 1 && (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rg-cpf">CPF</Label>
            <Input
              id="rg-cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground">ou</div>
          <div className="grid gap-1.5">
            <Label htmlFor="rg-tel">Telefone</Label>
            <Input
              id="rg-tel"
              inputMode="tel"
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rg-nome">Nome (apenas se cliente novo)</Label>
            <Input
              id="rg-nome"
              placeholder="Nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <Button onClick={avancarParaVenda} disabled={consultando} className="mt-1 gap-2">
            {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Avançar
          </Button>
        </div>
      )}

      {passo === 2 && (
        <div className="grid gap-3">
          <ClienteInfo cliente={cliente} saldoUsavel={saldoUsavel} />
          <div className="grid gap-1.5">
            <Label htmlFor="rg-num">Número da venda</Label>
            <Input
              id="rg-num"
              placeholder="Ex: 123456"
              value={numeroVenda}
              onChange={(e) => setNumeroVenda(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rg-val">Valor da venda (R$)</Label>
            <Input
              id="rg-val"
              inputMode="decimal"
              placeholder="0,00"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-1.5" onClick={() => setPasso(1)}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button className="flex-1" onClick={avancarParaCashback}>
              Avançar
            </Button>
          </div>
        </div>
      )}

      {passo === 3 && (
        <div className="grid gap-3">
          <ClienteInfo cliente={cliente} saldoUsavel={saldoUsavel} />
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div>Venda: <strong>{numeroVenda}</strong></div>
            <div>Valor: <strong>{BRL(valorNum)}</strong></div>
            <div className="mt-1 text-xs text-muted-foreground">
              Cashback máximo permitido nesta venda: {BRL(maxCashback)}
            </div>
          </div>
          <div className="text-sm font-medium">Usar cashback?</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="h-auto py-3"
              onClick={() => {
                setCashbackUsar(maxCashback);
                setPasso(4);
              }}
              disabled={maxCashback <= 0}
            >
              Usar {BRL(maxCashback)}
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3"
              onClick={() => {
                setCashbackUsar(0);
                setPasso(4);
              }}
            >
              Não usar
            </Button>
          </div>
          <Button variant="ghost" className="gap-1.5" onClick={() => setPasso(2)}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      )}

      {passo === 4 && (
        <div className="grid gap-3">
          <div className="rounded-lg border border-border bg-surface p-4 text-sm">
            <div className="mb-2 text-base font-semibold">Resumo</div>
            <Row k="Cliente" v={cliente?.nome ?? "—"} />
            <Row k="Venda" v={numeroVenda} />
            <Row k="Valor" v={BRL(valorNum)} />
            <Row
              k="Cashback a usar"
              v={cashbackUsar > 0 ? BRL(cashbackUsar) : "Não usar"}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={() => setPasso(saldoUsavel > 0 ? 3 : 2)}
              disabled={enviando}
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button className="flex-1 gap-2" onClick={confirmar} disabled={enviando}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ClienteInfo({ cliente, saldoUsavel }: { cliente: Cliente | null; saldoUsavel: number }) {
  if (!cliente) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <div className="font-medium">{cliente.nome ?? "Cliente"}</div>
      <div className="text-xs text-muted-foreground">
        Saldo usável: {BRL(saldoUsavel)}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-foreground">{v}</span>
    </div>
  );
}

function PassosIndicador({ passo, pulaCashback }: { passo: Passo; pulaCashback: boolean }) {
  const itens = [
    { n: 1, label: "Cliente" },
    { n: 2, label: "Venda" },
    { n: 3, label: "Cashback" },
    { n: 4, label: "Confirmar" },
  ];
  return (
    <div className="mb-4 flex items-center gap-1.5">
      {itens.map((it, i) => {
        const disabled = it.n === 3 && pulaCashback;
        const active = it.n === passo;
        const done = it.n < passo && !disabled;
        return (
          <div key={it.n} className="flex flex-1 items-center gap-1.5">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground",
                disabled && "opacity-40",
              )}
            >
              {it.n}
            </div>
            {i < itens.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
