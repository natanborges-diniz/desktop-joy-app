## Indicadores de mensagem (estilo WhatsApp)

Hoje o chat (`ConversaDetail.tsx`) já renderiza um `MessageTicks` ao lado do horário das mensagens enviadas por mim, com 3 estados:

- ⏱ `pending` — mensagem otimista (id `tmp-…`), ainda não confirmada pelo servidor
- ✓ `sent` — gravada no banco, mas `lida = false`
- ✓✓ azul `read` — destinatário marcou como lida

Mas há dois problemas:

1. **No chat, o tick fica quase invisível.** O texto do horário usa `text-foreground/55` em mensagens minhas, e o ✓ herda essa opacidade — em bolha clara some, em bolha escura também. Em telas pequenas o usuário simplesmente não nota.
2. **Na lista de conversas (`ConversasSidebar.tsx`), não existe nenhum tick.** Quando a última mensagem é minha, mostra só "Você: …" sem indicar se foi entregue/lida — diferente do WhatsApp.

### O que vamos fazer

**A. Reforçar ticks no chat (`src/pages/ConversaDetail.tsx`)**
- Mostrar o tick fora da `<p>` de horário, com cor própria:
  - `pending` → cinza claro
  - `sent` → cinza médio (✓ único, sem opacidade)
  - `read` → ✓✓ em azul WhatsApp (`text-sky-500`, já existe, mas garantir contraste)
- Aumentar levemente o ícone (h-3.5 → h-4) para ficar legível em mobile.
- Manter o `Clock3` para `pending`.

**B. Adicionar ticks no preview da sidebar (`src/components/ConversasSidebar.tsx`)**
- Quando `c.lastMessage.remetente_id === user.id`, antes do "Você:" renderizar o mesmo `MessageTicks` (extraído para um arquivo compartilhado, ex.: `src/components/MessageTicks.tsx`).
- Estado vem direto de `c.lastMessage.lida` (sent/read). Sem `pending` aqui (sidebar não tem otimista).

**C. Reuso**
- Mover o componente `MessageTicks` de dentro de `ConversaDetail.tsx` para `src/components/MessageTicks.tsx` e importar nos dois lugares.

### Fora de escopo
- Estado "entregue" separado de "enviado" (o schema só tem `lida` boolean — não dá para diferenciar "entregue ao device" de "salvo no servidor" sem mudar o banco).
- Mudanças no schema, RLS ou backend.
- Notificações/avisos da loja (já tratados em mensagens anteriores).

### Confirmação
Posso prosseguir com A+B+C? Ou você quer só a sidebar (B), só reforçar o chat (A), ou prefere também um estado "entregue" distinto (exigiria adicionar uma coluna `entregue_at` em `mensagens_internas`)?
