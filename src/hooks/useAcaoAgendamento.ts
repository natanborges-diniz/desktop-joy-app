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
      const { data, error } = await supabase.functions.invoke("loja-acao-agendamento", {
        body: input,
      });
      if (error) {
        // supabase-js v2: error.context costuma ser uma Response — extrai o body
        let msg: string | undefined;
        const ctx = (error as { context?: unknown }).context;
        if (ctx instanceof Response) {
          try {
            const body = await ctx.clone().json();
            msg = body?.error ?? body?.message;
          } catch {
            try {
              msg = await ctx.clone().text();
            } catch {
              /* noop */
            }
          }
        } else if (ctx && typeof ctx === "object") {
          msg = (ctx as { error?: string }).error;
        }
        throw new Error(msg || error.message || "Falha ao registrar ação");
      }
      return data as AcaoAgendamentoResponse;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notificacoes"] });
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
    },
  });
}
