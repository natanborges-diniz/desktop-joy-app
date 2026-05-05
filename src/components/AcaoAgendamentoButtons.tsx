import { useState } from "react";
import { Check, X, DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAcaoAgendamento } from "@/hooks/useAcaoAgendamento";

type Props = {
  agendamentoId: string;
  onDone?: () => void;
  size?: "sm" | "default";
};

type Modal = null | "venda" | "perguntaVenda" | "confirmNoshow";

export function AcaoAgendamentoButtons({ agendamentoId, onDone, size = "sm" }: Props) {
  const { mutateAsync, isPending } = useAcaoAgendamento();
  const [modal, setModal] = useState<Modal>(null);
  const [valor, setValor] = useState("");
  const [numeroVenda, setNumeroVenda] = useState("");
  const [osList, setOsList] = useState("");

  async function call(input: Parameters<typeof mutateAsync>[0]) {
    try {
      await mutateAsync(input);
      toast.success("Registrado");
      setModal(null);
      setValor("");
      setNumeroVenda("");
      setOsList("");
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    }
  }

  function submitVenda(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(valor.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Informe um valor de venda válido");
      return;
    }
    const oss = osList
      .split(/[,\s;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (oss.length === 0) {
      toast.error("Informe ao menos um número de OS");
      return;
    }
    void call({
      agendamento_id: agendamentoId,
      acao: "venda_fechada",
      valor_venda: v,
      numero_venda: numeroVenda.trim() || undefined,
      numeros_os: oss,
    });
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          size={size}
          variant="outline"
          className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
          disabled={isPending}
          onClick={(e) => {
            e.stopPropagation();
            setModal("perguntaVenda");
          }}
        >
          <Check className="mr-1 h-4 w-4" /> Compareceu
        </Button>
        <Button
          size={size}
          variant="outline"
          className="border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-300"
          disabled={isPending}
          onClick={(e) => {
            e.stopPropagation();
            setModal("confirmNoshow");
          }}
        >
          <X className="mr-1 h-4 w-4" /> Não compareceu
        </Button>
        <Button
          size={size}
          variant="outline"
          className="border-primary/40 text-primary hover:bg-primary/10"
          disabled={isPending}
          onClick={(e) => {
            e.stopPropagation();
            setModal("venda");
          }}
        >
          <DollarSign className="mr-1 h-4 w-4" /> Venda fechada
        </Button>
      </div>

      <AlertDialog
        open={modal === "confirmNoshow"}
        onOpenChange={(o) => !o && setModal(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como não compareceu?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação registra o cliente como faltante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void call({ agendamento_id: agendamentoId, acao: "noshow" })}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={modal === "perguntaVenda"}
        onOpenChange={(o) => !o && setModal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Foi venda fechada?</DialogTitle>
            <DialogDescription>
              Se sim, registre os dados. Se não, marcamos só como compareceu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => void call({ agendamento_id: agendamentoId, acao: "compareceu" })}
            >
              Não, só compareceu
            </Button>
            <Button onClick={() => setModal("venda")} disabled={isPending}>
              Sim, registrar venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "venda"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar venda fechada</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitVenda} className="space-y-3">
            <div>
              <Label htmlFor="valor">Valor da venda (R$)</Label>
              <Input
                id="valor"
                inputMode="decimal"
                placeholder="1250.50"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="os">Números de OS (separe por vírgula)</Label>
              <Input
                id="os"
                placeholder="12345, 12346"
                value={osList}
                onChange={(e) => setOsList(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="nv">Nº da venda (opcional)</Label>
              <Input
                id="nv"
                value={numeroVenda}
                onChange={(e) => setNumeroVenda(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
