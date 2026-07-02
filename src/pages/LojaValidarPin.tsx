import { useMemo, useState } from "react";
import { KeyRound, Loader2, RefreshCw, CheckCircle2, AlertCircle, Clock, Send } from "lucide-react";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePinsPendentes, type InscricaoPendente } from "@/hooks/usePinsPendentes";
import { useCashbackLojaPayload } from "@/hooks/useCashbackLojaPayload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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

function tempoDe(s: string) {
  try {
    return formatDistanceToNow(parseISO(s), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

function tempoDesde(s: string) {
  try {
    return formatDistanceToNow(parseISO(s), { locale: ptBR });
  } catch {
    return "";
  }
}

function brl(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "R$ 0,00";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function invokeCashback(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("cashback-loja", { body });
  if (error) throw error;
  return data as any;
}

export default function LojaValidarPin() {
  const { aguardando, expirados, confirmadosHoje, loading, error, reload } = usePinsPendentes();
  const lojaPayload = useCashbackLojaPayload();
  const [tab, setTab] = useState("aguardando");

  const totalPendentes = aguardando.length + expirados.length;

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center gap-2 md:h-16">
          <KeyRound className="h-5 w-5" />
          <h1 className="text-lg font-semibold md:text-xl">Cashback — Validar PIN</h1>
        </div>
        <p className="pb-3 text-sm text-white/80">
          {loading
            ? "Carregando..."
            : totalPendentes === 0
            ? "Nenhum PIN pendente"
            : `${totalPendentes} pendente${totalPendentes > 1 ? "s" : ""}`}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          {!loading && error && (
            <Card className="flex items-start gap-3 p-4 text-sm shadow-soft">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <div className="font-medium text-foreground">Falha ao carregar PINs</div>
                <div className="mt-1 text-muted-foreground">{error}</div>
              </div>
            </Card>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="aguardando" className="gap-1.5">
                Aguardando
                {aguardando.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5">
                    {aguardando.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="expirados" className="gap-1.5">
                Reenviar
                {expirados.length > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5">
                    {expirados.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="confirmados" className="gap-1.5">
                Hoje
                {confirmadosHoje.length > 0 && (
                  <Badge className="h-5 bg-emerald-600 px-1.5 hover:bg-emerald-600">
                    {confirmadosHoje.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="aguardando" className="mt-3 space-y-3">
              {loading ? (
                <LoadingBox />
              ) : aguardando.length === 0 ? (
                <EmptyBox icon="ok" text="Nenhuma inscrição aguardando validação." />
              ) : (
                aguardando.map((it) => (
                  <PinCardAguardando key={it.id} item={it} onDone={reload} lojaPayload={lojaPayload} />
                ))
              )}
            </TabsContent>

            <TabsContent value="expirados" className="mt-3 space-y-3">
              {loading ? (
                <LoadingBox />
              ) : expirados.length === 0 ? (
                <EmptyBox icon="ok" text="Nenhum PIN expirado ou bloqueado." />
              ) : (
                expirados.map((it) => (
                  <PinCardExpirado key={it.id} item={it} onDone={reload} lojaPayload={lojaPayload} />
                ))
              )}
            </TabsContent>

            <TabsContent value="confirmados" className="mt-3 space-y-3">
              {loading ? (
                <LoadingBox />
              ) : confirmadosHoje.length === 0 ? (
                <EmptyBox icon="clock" text="Nenhum PIN confirmado hoje ainda." />
              ) : (
                confirmadosHoje.map((it) => <PinCardConfirmado key={it.id} item={it} />)
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function LoadingBox() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyBox({ icon, text }: { icon: "ok" | "clock"; text: string }) {
  const Icon = icon === "ok" ? CheckCircle2 : Clock;
  return (
    <Card className="p-6 text-center text-sm text-muted-foreground shadow-soft">
      <Icon className="mx-auto mb-2 h-8 w-8 text-primary" />
      {text}
    </Card>
  );
}

function CardHeader({ item }: { item: InscricaoPendente }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-foreground">
          {item.nome_cliente ?? "Cliente"}
        </div>
        {item.loja_nome && (
          <div className="truncate text-xs font-medium text-primary">{item.loja_nome}</div>
        )}
        {item.whatsapp && <div className="text-xs text-muted-foreground">{item.whatsapp}</div>}
        {item.cpf && <div className="text-[11px] text-muted-foreground">CPF {item.cpf}</div>}
        {item.numero_venda && (
          <div className="text-[11px] text-muted-foreground">Venda #{item.numero_venda}</div>
        )}
      </div>
      <div className="text-right text-[11px] text-muted-foreground">{tempoDe(item.criado_em)}</div>
    </div>
  );
}

function PinCardAguardando({
  item,
  onDone,
  lojaPayload,
}: {
  item: InscricaoPendente;
  onDone: () => void;
  lojaPayload: Record<string, unknown>;
}) {
  const [pin, setPin] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const pinOk = useMemo(() => /^\d{4}$/.test(pin), [pin]);
  const tentativas = item.pin_tentativas ?? 0;

  async function confirmar() {
    if (!pinOk) {
      toast.error("Informe os 4 dígitos do PIN.");
      return;
    }
    setConfirmando(true);
    try {
      const data = await invokeCashback({
        action: "confirmar_pin",
        ...lojaPayload,
        inscricao_id: item.id,
        pin,
      });
      if (
        data?.status === "validado" ||
        data?.status === "ja_confirmado" ||
        data?.status === "ok" ||
        data?.ok === true ||
        data?.validado === true
      ) {
        toast.success("PIN validado. Cashback ativado.");
        onDone();
      } else {
        const motivos: Record<string, string> = {
          pin_incorreto: `PIN incorreto. Tentativas restantes: ${data?.tentativas_restantes ?? 0}`,
          pin_expirado: "PIN expirou. Vá em Reenviar para gerar um novo.",
          pin_nao_gerado: "PIN ainda não foi gerado. Use Reenviar.",
          tentativas_excedidas: "Tentativas excedidas. Vá em Reenviar para gerar novo PIN.",
        };
        toast.error(motivos[data?.motivo] || data?.mensagem || data?.error || "PIN incorreto ou expirado.");
        onDone();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao validar PIN.");
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <Card className="p-4 shadow-soft">
      <CardHeader item={item} />

      <div className="mt-3 flex flex-wrap gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
        <div>
          <span className="text-muted-foreground">Tentativas: </span>
          <span className="font-medium">{tentativas}/3</span>
        </div>
        {item.pin_expira_at && (
          <div>
            <span className="text-muted-foreground">Expira </span>
            <span className="font-medium">{tempoDe(item.pin_expira_at)}</span>
          </div>
        )}
        {item.credito?.valor != null && (
          <div>
            <span className="text-muted-foreground">Cashback: </span>
            <span className="font-medium">{brl(item.credito.valor)}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          inputMode="numeric"
          pattern="\d*"
          maxLength={4}
          placeholder="PIN (4 dígitos)"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D+/g, "").slice(0, 4))}
          className="tracking-[0.4em] text-center text-lg font-semibold sm:flex-1"
        />
        <Button onClick={confirmar} disabled={confirmando || !pinOk} className="gap-2 sm:w-32">
          {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Confirmar
        </Button>
      </div>
    </Card>
  );
}

function PinCardExpirado({
  item,
  onDone,
  lojaPayload,
}: {
  item: InscricaoPendente;
  onDone: () => void;
  lojaPayload: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const tentativas = item.pin_tentativas ?? 0;
  const expirado = item.pin_expira_at ? new Date(item.pin_expira_at).getTime() < Date.now() : false;
  const bloqueado = tentativas >= 9;

  const motivoBadge = tentativas >= 3 && !expirado ? "3 tentativas erradas" : expirado && item.pin_expira_at ? `Expirou há ${tempoDesde(item.pin_expira_at)}` : "Bloqueado";

  const cashback = item.credito?.valor ?? null;

  async function reenviar() {
    setReenviando(true);
    try {
      const data = await invokeCashback({
        action: "reenviar_pin",
        ...lojaPayload,
        inscricao_id: item.id,
      });
      if (
        data?.status === "pin_enviado" ||
        data?.status === "ok" ||
        data?.ok === true ||
        data?.enviado === true
      ) {
        toast.success("Novo PIN enviado ao cliente.");
        onDone();
      } else if (data?.status === "ja_confirmado") {
        toast.success("PIN já confirmado.");
        onDone();
      } else {
        toast.message(data?.mensagem || "Solicitação registrada.");
        onDone();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reenviar PIN.");
    } finally {
      setReenviando(false);
      setOpen(false);
    }
  }

  return (
    <Card className="p-4 shadow-soft">
      <CardHeader item={item} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          {motivoBadge}
        </Badge>
        {bloqueado && (
          <Badge variant="outline" className="border-destructive text-destructive">
            Reenvios esgotados
          </Badge>
        )}
      </div>

      <div className="mt-3">
        <Button
          onClick={() => setOpen(true)}
          disabled={reenviando || bloqueado}
          className="w-full gap-2"
          variant="default"
        >
          {reenviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Reenviar PIN
        </Button>
        {bloqueado && (
          <p className="mt-2 text-xs text-muted-foreground">
            Limite de reenvios atingido. Peça ao cliente para refazer a inscrição.
          </p>
        )}
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reenviar novo PIN?</AlertDialogTitle>
            <AlertDialogDescription>
              O cashback de <b>{brl(cashback)}</b> está pendente e só será ativado quando o cliente digitar o PIN. Enviar novo código de 6 dígitos para{" "}
              <b>{item.whatsapp ?? "o cliente"}</b>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reenviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reenviar} disabled={reenviando}>
              {reenviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function PinCardConfirmado({ item }: { item: InscricaoPendente }) {
  const credito = item.credito;
  const valor = credito?.valor ?? null;
  const libera = credito?.libera_em;
  let liberaFmt = "";
  if (libera) {
    try {
      liberaFmt = format(parseISO(libera), "dd/MM", { locale: ptBR });
    } catch {
      liberaFmt = "";
    }
  }

  return (
    <Card className="p-4 shadow-soft">
      <CardHeader item={item} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
          <CheckCircle2 className="h-3 w-3" />
          Cashback ativado {valor != null ? brl(valor) : ""}
        </Badge>
        {liberaFmt && (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Libera {liberaFmt}
          </Badge>
        )}
        {item.pin_confirmado_at && (
          <span className="text-[11px] text-muted-foreground">
            Confirmado {tempoDe(item.pin_confirmado_at)}
          </span>
        )}
      </div>
    </Card>
  );
}
