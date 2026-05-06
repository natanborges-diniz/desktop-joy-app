# Notificações sem botões de ação — corrigir

## Diagnóstico

No `NotificacoesList.tsx` o conjunto `TIPOS_COM_ACOES` cobre apenas 3 tipos. As notificações que aparecem **sem botões** na sua tela são do tipo `agendamento_confirmacao` (ex.: "📋 Confirme comparecimento — Bruno", "⚠️ Pendência de confirmação — Gustavo"). Pela mensagem ("Compareceu?"), elas claramente exigem a mesma ação Compareceu / Não compareceu / Venda fechada — só não foram mapeadas.

Resultado: a loja não consegue resolver e a notificação fica eterna na lista, e o badge de pendências nunca zera.

## O que vamos mudar (1 arquivo)

**`src/pages/NotificacoesList.tsx`**

1. Adicionar `"agendamento_confirmacao"` ao set `TIPOS_AGENDAMENTO` e ao `TIPOS_COM_ACOES` — assim os 3 botões (Compareceu / Não compareceu / Venda fechada) aparecem nessas linhas, exatamente como já aparecem nas cobranças.
2. Adicionar caso no `tipoBadge` para `"agendamento_confirmacao"` → label "Confirme comparecimento", tom âmbar (mesma família visual de cobrança).
3. **Fallback genérico**: para qualquer outro `tipo` desconhecido que tenha `referencia_id` E cujo título/mensagem contenha "compareceu" / "comparecimento", também renderizar os botões. Isso protege outras lojas se aparecerem novos tipos parecidos sem o front saber.
4. **Botão "Marcar como lida" mais visível** em qualquer notificação sem ação (substituir a bolinha azul por um botão pequeno com texto "Marcar como lida"), para que mesmo notificações puramente informativas (`agendamento_novo_loja`, etc.) possam ser zeradas com um clique óbvio.

## Fora de escopo

- Não vou apagar registros antigos do banco (você falou em "eliminá-las" — interpretei como "permitir que sejam baixadas/resolvidas", não deletar histórico). Se quiser DELETE em massa das antigas (`agendamento_confirmacao` com `created_at < hoje`), me diga e faço uma migration separada.
- Não toco na edge function `loja-acao-agendamento`; ela já aceita `agendamento_id` e os 3 acoes existentes — funciona pro tipo novo sem mudança.
- Sem mudanças em RLS / schema.
