import { useMemo, useState } from "react";
import { KeyRound, Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePinsPendentes, type InscricaoPendente } from "@/hooks/usePinsPendentes";
import { useCashbackLojaPayload } from "@/hooks/useCashbackLojaPayload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function tempoDe(s: string) {
  try {
    return formatDistanceToNow(parseISO(s), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

async function invokeCashback(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("cashback-loja", { body });
  if (error) throw error;
  return data as any;
}

export default function LojaValidarPin() {
  const { items, loading, count, reload, error } = usePinsPendentes();
  const lojaPayload = useCashbackLojaPayload();

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center gap-2 md:h-16">
          <KeyRound className="h-5 w-5" />
          <h1 className="text-lg font-semibold md:text-xl">Cashback — Validar PIN</h1>
        </div>
        <p className="pb-3 text-sm text-white/80">
          {loading ? "Carregando..." : count === 0 ? "Nenhum PIN pendente" : `${count} pendente${count > 1 ? "s" : ""}`}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && error && (
            <Card className="flex items-start gap-3 p-4 text-sm shadow-soft">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <div className="font-medium text-foreground">Falha ao carregar PINs</div>
                <div className="mt-1 text-muted-foreground">{error}</div>
              </div>
            </Card>
          )}
          {!loading && items.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground shadow-soft">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-primary" />
              Tudo em dia! Nenhuma inscricao aguardando validacao de PIN.
            </Card>
          )}
          {items.map((it) => (
            <PinCard key={it.id} item={it} onDone={reload} lojaPayload={lojaPayload} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PinCard({
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
  const [reenviando, setReenviando] = useState(false);
  const pinOk = useMemo(() => /^\d{4}$/.test(pin), [pin]);

  async function confirmar() {
    if (!pinOk) {
      toast.error("Informe os 4 digitos do PIN.");
      return;
    }
    setConfirmando(true);
    try {
      const data = await invokeCashback({
        action: "validar_pin",
        ...lojaPayload,
        inscricao_id: item.id,
        pin,
      });
      if (data?.status === "ok" || data?.ok === true || data?.validado === true) {
        toast.success("PIN validado com sucesso.");
        onDone();
      } else {
        toast.error(data?.mensagem || data?.error || "PIN incorreto ou expirado.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao validar PIN.");
    } finally {
      setConfirmando(false);
    }
  }

  async function reenviar() {
    setReenviando(true);
    try {
      const data = await invokeCashback({ action: "reenviar_pin", ...lojaPayload, inscricao_id: item.id });
      if (data?.status === "ok" || data?.ok === true || data?.enviado === true) {
        toast.success("PIN reenviado ao cliente.");
      } else {
        toast.message(data?.mensagem || "Solicitacao registrada.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reenviar PIN.");
    } finally {
      setReenviando(false);
    }
  }

  const tentativas = item.pin_tentativas ?? 0;
  const expirado = item.pin_expira_at ? new Date(item.pin_expira_at).getTime() < Date.now() : false;

  return (
    <Card className="p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-foreground">
            {item.nome_cliente ?? "Cliente"}
          </div>
          {item.loja_nome && (
            <div className="truncate text-xs font-medium text-primary">{item.loja_nome}</div>
          )}
          {item.whatsapp && (
            <div className="text-xs text-muted-foreground">{item.whatsapp}</div>
          )}
          {item.cpf && (
            <div className="text-[11px] text-muted-foreground">CPF {item.cpf}</div>
          )}
          {!item.loja_nome && item.cod_empresa && (
            <div className="truncate text-[11px] text-muted-foreground">
              Loja cod. {item.cod_empresa}
            </div>
          )}
        </div>
        <div className="text-right text-[11px] text-muted-foreground">{tempoDe(item.criado_em)}</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
        <div>
          <span className="text-muted-foreground">Tentativas: </span>
          <span className="font-medium">{tentativas}</span>
        </div>
        {item.pin_expira_at && (
          <div>
            <span className="text-muted-foreground">PIN {expirado ? "expirou" : "expira"} </span>
            <span className={`font-medium ${expirado ? "text-destructive" : ""}`}>
              {tempoDe(item.pin_expira_at)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          inputMode="numeric"
          pattern="\d*"
          maxLength={4}
          placeholder="PIN (4 digitos)"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D+/g, "").slice(0, 4))}
          className="tracking-[0.4em] text-center text-lg font-semibold sm:flex-1"
        />
        <Button onClick={confirmar} disabled={confirmando || !pinOk} className="gap-2 sm:w-32">
          {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Confirmar
        </Button>
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={reenviar}
          disabled={reenviando}
          className="gap-1.5 text-xs"
        >
          {reenviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Reenviar PIN
        </Button>
      </div>
    </Card>
  );
}
