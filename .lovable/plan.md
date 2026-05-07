
# Plano

Dois problemas independentes, resolvidos em frentes separadas. Tudo é frontend, sem mudar o banco externo.

---

## 1) iPhone (PWA) — conversas não aparecem

### Causa provável
- O Service Worker registrado em produção (`/sw.js`) está servindo bundle antigo **antes** da correção do probe de colunas. No iOS o SW é especialmente "grudento" e só atualiza quando todas as abas/janelas do PWA são fechadas.
- Sem o fix novo, qualquer erro RLS/transitório no probe fazia a sidebar consultar `editada_em,apagada_em` (que não existem) → 400 → lista vazia, e silenciosamente.

### O que fazer

**a) Forçar atualização agressiva do SW**
- No `src/sw.ts`: já chama `skipWaiting()` e `clients.claim()`, mas não notifica o cliente. Adicionar um `BroadcastChannel("sw-update")` ou usar o `controllerchange` listener no `main.tsx` para **dar `window.location.reload()` automático** quando um novo SW assume o controle. Isso garante que, na próxima abertura no iPhone, a tela carrega o bundle novo sem o usuário precisar fechar manualmente.
- No `main.tsx`, ao registrar o SW, chamar `registration.update()` periodicamente (a cada foco da janela) para acelerar a detecção.

**b) Indicador diagnóstico na sidebar**
- Em `ConversasSidebar.tsx`, quando `loading=false` e `messages.length===0`, exibir o motivo real:
  - `"Sem sessão ativa"` se `!user`
  - `"Erro ao carregar (código X)"` se `res.error` foi capturado
  - `"Nenhuma conversa ainda"` (atual) só quando realmente não há erro.
- Salvar o último erro em estado local para mostrar.

**c) Evitar empty silencioso quando RLS retorna 0 linhas mas usuário tem conversas**
- Como tem fallback agora pra `BASE_COLUMNS`, isso já está mitigado. O indicador acima cobre o resto.

### Como testar no iPhone
1. Após deploy, abrir o PWA → ele detecta o SW novo, recarrega sozinho.
2. Conversas voltam a aparecer.
3. Se ainda vier vazio, aparece um texto explicando o motivo (não mais a tela vaga).

---

## 2) Avisos — dinâmica confusa

### Problemas reportados
1. Notificações "compareceu/não compareceu/venda" continuam visíveis depois de respondidas → poluição visual.
2. Dispara mais de uma notificação para a mesma situação (operador acaba registrando ação 2x).
3. 2ª cobrança aparece somada à 1ª, sem correlação. Para limpar a tela, operador precisa marcar as duas como lida.
4. Notificação respondida deveria sumir da lista.

### Estratégia (tudo em `src/pages/NotificacoesList.tsx`)

**a) Esconder automaticamente notificações já lidas**
- Hoje a query traz tudo (`.limit(100)`). Adicionar filtro padrão `.eq("lida", false)` e oferecer um chip *"Ver lidas"* opcional.
- Resultado: assim que a notificação é marcada como `lida`, ela some da lista.

**b) Marcar como lida automaticamente quando ação é executada**
- O `AcaoAgendamentoButtons` já chama `onDone={() => marcarLida(n.id)}`. Manter.
- **Adicional**: quando o operador registra ação (compareceu/noshow/venda) num agendamento, marcar como lidas **todas** as notificações cujo `referencia_id === agendamentoId` (engloba 1ª e 2ª cobrança da mesma situação). Implementar em `marcarLidaPorAgendamento(agendamentoId)`.

**c) Deduplicar cobranças visuais (1ª + 2ª da mesma situação)**
- Antes de renderizar a lista, agrupar por `referencia_id` quando o `tipo` está em `TIPOS_COM_ACOES`.
- Para cada grupo, mostrar **apenas a notificação mais recente** (ex.: a 2ª cobrança substitui a 1ª).
- As notificações antigas do mesmo grupo são marcadas como lidas em background ao montar a lista (evita que voltem a aparecer caso o filtro mude).

**d) Botão "Marcar como lida" sempre disponível**
- Hoje só aparece quando não há `showActions`. Habilitar também nos cards com ações, no canto inferior direito (texto sutil "Dispensar"), pra cobrir o caso "operador já tratou fora do app".

### Resumo de comportamento após mudança
- Lista mostra só pendências reais (`lida=false`).
- Ao clicar em compareceu/noshow/venda: ação registrada → todas notificações daquele agendamento somem.
- 2ª cobrança chega → 1ª some da tela automaticamente; só fica a mais recente.
- Operador pode "Dispensar" qualquer card manualmente.
- Toggle "Ver lidas" para auditoria, sem encher a tela do dia a dia.

### Out of scope (precisaria mudar o banco do atrium-link, fora deste projeto)
- Impedir o **gerador** de notificações duplicadas no servidor (raiz do problema 2). Aqui só mascaramos visualmente a duplicação. Posso documentar no `.lovable/plan.md` para tratar depois.

---

## Arquivos que serão alterados
- `src/main.tsx` — auto reload no `controllerchange` + `registration.update()` no foco.
- `src/sw.ts` — confirmar `skipWaiting`/`clients.claim` (já ok).
- `src/components/ConversasSidebar.tsx` — estado de erro + mensagens diagnósticas.
- `src/pages/NotificacoesList.tsx` — filtro `lida=false`, dedupe por `referencia_id`, marcar lida em massa por agendamento, toggle "Ver lidas", botão "Dispensar" universal.
