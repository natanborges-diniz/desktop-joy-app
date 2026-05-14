import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AcaoAgendamentoInput =
  | { agendamento_id: string; acao: "compareceu" }
  | { agendamento_id: string; acao: "noshow" }
  | { agendamento_id: string; acao: "reverter_noshow" }
  | {
      agendamento_id: string;
      acao: "venda_fechada";
      valor_venda: number;
      numero_venda?: string;
      numeros_os?: string[];
    };

export type AcaoAgendamentoResponse = {
  ok: true;
  status: "compareceu" | "no_show" | "venda_fechada";
};

export function useAcaoAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AcaoAgendamentoInput): Promise<AcaoAgendamentoResponse> => {
      const { data, error } = await supabase.functions.invoke("proxy-loja-acao-agendamento", {
        body: input,
      });
      if (error) {
        const msg =
          (error as { context?: { error?: string }; message?: string }).context?.error ??
          error.message ??
          "Falha ao registrar ação";
        throw new Error(msg);
      }
      return data as AcaoAgendamentoResponse;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notificacoes"] });
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
    },
  });
}
