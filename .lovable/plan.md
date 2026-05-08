
## Objetivo

Hoje uma transmissão para um grupo aparece como N conversas separadas na sidebar (uma por destinatário). Vamos espelhar a estrutura do projeto Atrium (Lovable Connect & Flow), tratando `conversa_id` que começa com `grupo_` como **uma única conversa** e listando também grupos vindos de `conversas_grupo` onde o usuário está em `participantes` — mesmo sem mensagens ainda. V1 sem editar / apagar mensagem em grupo.

## O que muda

### 1. `src/components/ConversasSidebar.tsx`

- Trocar a chave de agrupamento: hoje agrupa por `otherId` (1:1). Passar a agrupar por `conversa_id`:
  - se `conversa_id` começar com `grupo_` → entrada de grupo (chave = `conversa_id`)
  - senão → entrada 1:1 (chave = `conversa_id` derivado de `[remetente, destinatario].sort().join("_")`, conforme `lib/conversa.ts`).
- Para grupos, **não ler `profiles[otherId]`**; ler de `conversas_grupo` (`id, nome, participantes, created_at`).
- Buscar também `conversas_grupo` onde `participantes` contém `auth.uid()` (`.contains("participantes", [user.id])`) e mesclar com os grupos que já têm mensagem; grupos sem mensagem aparecem com:
  - `ultima_mensagem` = "Grupo criado — envie a primeira mensagem"
  - `ultima_data` = `created_at` do grupo
  - `nao_lidas` = 0
- Não-lidas de grupo = `cmsgs.filter(m => m.destinatario_id === uid && !m.lida).length` (cada participante tem sua linha).
- Filtrar fora `conversa_id LIKE 'demanda_%'` e `'ponte_%'` (já fazemos algo parecido — confirmar e padronizar com `.not("conversa_id","like","demanda_%")` e `'ponte_%'`).
- Avatar/nome: para grupos, mostrar ícone de grupo (`Users`) no lugar do `UserAvatar` e o `nome` do grupo. Item leva para `/grupos/<grupo_id>` em vez de `/conversas/<otherId>`.
- Tick `MessageTicks` da última mensagem em grupo: mostrar só `sent` (sem ✓✓ por enquanto — V2).

### 2. Nova página `src/pages/GrupoChat.tsx` (rota `/grupos/:groupId`)

- Estrutura espelha `ConversaDetail.tsx`, mas:
  - carrega `conversas_grupo` por `id = groupId` para pegar `nome` e `participantes`; se `participantes` não inclui `user.id`, redireciona para `/`.
  - Carrega mensagens com `.eq("conversa_id", "grupo_" + groupId)` ordenado por `created_at asc`.
  - **Dedup do feed**: cada envio em grupo gera N linhas (uma por destinatário). Antes de renderizar, deduplicar por chave `${remetente_id}|${conteudo}|${anexo_url ?? ""}|${created_at até segundo}`.
  - Carregar `profiles` de todos os `participantes` (id → nome) para etiquetar balões recebidos com **nome do remetente** (estilo WhatsApp). Para mensagens minhas, sem etiqueta.
  - Header: ícone `Users`, nome do grupo, "N participantes".
  - Realtime: assinar `mensagens_internas` com filtro `conversa_id=eq.grupo_<id>` (event `*`) e refazer query.
  - **V1 sem MessageActionsMenu** (sem editar/apagar) — em grupo as N cópias confundem a UX.
  - Reusar o mesmo bloco de anexo/upload do `ConversaDetail.tsx` (bucket `mensagens-anexos`).
  - Marcar como lidas: `update mensagens_internas set lida=true where conversa_id='grupo_<id>' and destinatario_id=user.id and lida=false` ao montar/scroll-end.

### 3. Envio em grupo

- Fonte da verdade: `conversas_grupo.participantes` (array de uuids).
- Inserir N-1 linhas em `mensagens_internas`:
  ```
  participantes.filter(p => p !== user.id).map(d => ({
    remetente_id: user.id,
    destinatario_id: d,
    conversa_id: `grupo_${groupId}`,
    conteudo, anexo_url?, anexo_tipo?,
  }))
  ```
- Se `outros.length === 0` → toast "Grupo sem outros participantes".
- Não enviar para si mesmo (evita duplicar bolha após dedup).

### 4. `src/App.tsx`

- Importar `GrupoChat` e adicionar `<Route path="/grupos/:groupId" element={<GrupoChat />} />` dentro do bloco protegido.

### 5. `src/components/AppShell.tsx`

- Tratar a rota de grupo como rota de conversa: regex
  ```
  const isConversaRoute = isHome
    || /^\/conversas\/[^/]+/.test(pathname)
    || /^\/grupos\/[^/]+/.test(pathname);
  const hideBottomNav =
    /^\/conversas\/[^/]+/.test(pathname)
    || /^\/grupos\/[^/]+/.test(pathname)
    || /^\/demandas\/[^/]+/.test(pathname);
  ```
- Sidebar continua a `ConversasSidebar` — agora ela já mostra grupos.

### 6. Item ativo na sidebar

- `useParams` já retorna `otherId` em `/conversas/:otherId`. Adicionar leitura também do path para grupos: `useMatch("/grupos/:groupId")`. Item de grupo fica destacado quando `groupId === entry.grupo_id`.

### 7. Não-lidas globais (`useUnreadCount`)

- Já conta `lida=false` para `destinatario_id = user.id`. Como cada cópia em grupo já é uma linha com `destinatario_id`, o badge funciona automaticamente. Não precisa alterar.

## Tabelas e RLS necessárias (no banco compartilhado)

Tudo isso já existe no projeto Atrium (`conversas_grupo` com `participantes uuid[]`, RLS por membership, `mensagens_internas` aceita `conversa_id` arbitrária). **Nenhuma migração será aplicada por este projeto** — quem faz schema é o projeto Atrium. Aqui só consumimos. Caso ainda não existam, abrir uma demanda no Atrium para garantir:
- `public.conversas_grupo (id uuid pk, nome text, participantes uuid[], criado_por uuid, tipo_origem text, origem_ref text, created_at)`
- RLS: `select` se `auth.uid() = ANY(participantes)`.

## Fora do escopo (V1)

- Editar / apagar mensagem em grupo.
- Tick "lida por todos" (verificar todas as cópias) — fica `sent`.
- Criar grupo a partir do Messenger (criação continua no Atrium / admin).
- Indicador de digitação em grupo.

## Critérios de aceite

1. Uma transmissão recebida de um grupo aparece como **um único item** na sidebar com nome do grupo e ícone de grupo.
2. Grupos onde sou membro mas ainda sem mensagens aparecem com "Grupo criado — envie a primeira mensagem".
3. Clicar no item abre `/grupos/<id>` mostrando o feed sem mensagens duplicadas.
4. Cada balão recebido mostra o **nome do remetente** acima.
5. Ao enviar uma mensagem em grupo, todos os outros participantes a recebem em tempo real e o badge não-lidas global atualiza para cada um.
6. Mensagens fora do grupo (1:1, demandas) continuam funcionando exatamente como hoje.
7. Bottom nav mobile some dentro de `/grupos/:groupId`, igual a `/conversas/:otherId`.
