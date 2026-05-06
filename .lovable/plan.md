# Checks de status de mensagem (estilo WhatsApp)

Adicionar indicadores visuais nos balões de mensagens **enviadas por mim** em `src/pages/ConversaDetail.tsx`, seguindo o padrão WhatsApp:

- 🕗 Relógio cinza → mensagem otimista, ainda não confirmada pelo servidor (id começa com `tmp-`).
- ✓ Um check cinza → enviada e gravada no servidor (id real, `lida = false`).
- ✓✓ Dois checks azuis → lida pelo destinatário (`lida = true`).

Mensagens recebidas continuam sem check (igual WhatsApp).

## Como será feito

1. **Componente `MessageTicks`** (inline em `ConversaDetail.tsx`, pequeno):
   - Recebe `status: "pending" | "sent" | "read"`.
   - Renderiza ícones do `lucide-react`: `Clock3` (pending), `Check` (sent), `CheckCheck` (sent + read), com cor azul quando lida.

2. **Derivar status** dentro do `.map` que renderiza cada mensagem:
   ```ts
   const status = m.id.startsWith("tmp-") ? "pending" : m.lida ? "read" : "sent";
   ```

3. **Renderizar ao lado do horário** no rodapé do balão `mine`, mantendo o layout atual (`mt-1 text-right`).

4. **Realtime de leitura**: o canal atual em `ConversaDetail.tsx` só escuta `INSERT`. Para que o remetente veja os checks virarem azuis quando o outro lado abrir a conversa, ampliar o filtro do canal para também escutar `UPDATE` em `mensagens_internas` e atualizar a `lida` da mensagem correspondente no estado local (sem refetch).

5. **Sem mudança de schema**: o campo `lida: boolean` já existe e já é marcado como `true` no `load()` do destinatário (linhas 89-97). Nenhum trigger/migration necessário.

## Fora do escopo

- Não adicionar estado "entregue" separado (não há coluna `entregue_em`); WhatsApp tem 3 estados, aqui ficam 3 também mas mapeados a "pendente / enviada / lida".
- Não mexer em `ConversasSidebar.tsx` (lista) — só no detalhe da conversa.
- Não alterar fluxo de envio nem otimismo.

## Risco

- Para o `UPDATE` realtime funcionar, a publicação `supabase_realtime` precisa incluir UPDATEs de `mensagens_internas`. Se não estiver habilitado, o check só vira azul no próximo carregamento da tela. Caso necessário, será adicionada uma migration `ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_internas` (já provavelmente existente, dado que INSERT já funciona).
