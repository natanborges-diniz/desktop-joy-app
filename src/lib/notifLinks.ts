// Resolve para qual rota uma notificação deve abrir, com base em `tipo` e
// `referencia_id`. As notificações funcionam como ponte: ao tocar/clicar,
// o usuário é levado direto para a demanda, conversa, grupo ou agenda
// correspondente — não fica preso na lista de avisos.

export type NotifLinkInput = {
  tipo: string | null;
  referencia_id: string | null;
  titulo?: string | null;
  mensagem?: string | null;
};

/**
 * Devolve o caminho (path) para abrir a notificação no contexto certo.
 * Quando não há referência específica, devolve `/notificacoes`.
 *
 * @param isLoja  true quando o usuário é do tipo "loja" (vê próprias demandas
 *                em /minhas-demandas). Operadores internos vão para /demandas/:id.
 */
export function resolveNotifLink(n: NotifLinkInput, isLoja: boolean): string {
  const tipo = (n.tipo ?? "").toLowerCase();
  const ref = n.referencia_id ?? null;

  // ---- Agendamentos (loja confirma/cliente confirmou/cobranças) ----
  if (
    tipo.startsWith("agendamento_") ||
    tipo.startsWith("cobranca_comparecimento")
  ) {
    return "/agenda";
  }

  // ---- Conversas 1:1 ----
  if (tipo.startsWith("mensagem") || tipo.startsWith("conversa")) {
    if (ref) return `/conversas/${ref}`;
    return "/";
  }

  // ---- Grupos ----
  if (tipo.startsWith("grupo")) {
    if (ref) return `/grupos/${ref}`;
    return "/";
  }

  // ---- Recebimento de OS ----
  if (tipo.startsWith("os_") || tipo.includes("recebimento_os")) {
    return "/recebimento-os";
  }

  // ---- Cashback ----
  if (tipo.startsWith("cashback")) {
    return "/cashback";
  }

  // ---- Solicitações / Demandas / Boletos / Revisões / CPF ----
  // Heurística ampla: tudo que tiver referência e não casou acima costuma ser
  // uma solicitacao_id (boleto enviado, revisão respondida, novo comentário,
  // CPF aprovado/reprovado, etc.).
  if (ref) {
    if (
      tipo.includes("boleto") ||
      tipo.includes("revisao") ||
      tipo.includes("solicit") ||
      tipo.includes("demanda") ||
      tipo.includes("comentario") ||
      tipo.includes("cpf") ||
      tipo.includes("confirma")
    ) {
      return isLoja
        ? `/minhas-demandas?solicitacao=${ref}`
        : `/demandas/${ref}`;
    }
  }

  return "/notificacoes";
}
