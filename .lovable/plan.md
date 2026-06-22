## Recebimento de OS — plano

Como você confirmou só "OS, cliente, Produto" e o resto eu não consigo inspecionar (backend externo), vou trabalhar com **suposições claras** e ajustar depois se algum nome estiver diferente.

### Suposições de schema (`os_recebimento_loja`)
Vou assumir estas colunas — se algum nome real for diferente, me diga só os que mudam:

| Coluna assumida | Uso |
|---|---|
| `id uuid` | PK enviada à edge function |
| `numero_os text` | título do card |
| `cliente_nome text` | linha "Cliente" |
| `produto text` | linha "Produto" |
| `data_movimentacao timestamptz` (ou `date`) | "Movimentado em D-1" |
| `loja_nome text` | filtro contra `user_acessos.lojas[]` |
| `recebido_at timestamptz` | NULL = pendente, NOT NULL = histórico |
| `recebido_por uuid` / `recebido_por_nome text` | exibido no histórico (se existir) |
| `created_at timestamptz` | ordenação fallback |

### Contrato edge function
`supabase.functions.invoke('confirmar-recebimento-os', { body: { os_recebimento_id } })` — vou tratar:
- sucesso = sem `error` no retorno do invoke E sem `data.error`
- qualquer falha → toast de erro + manter card na lista

Sem headers extras (o invoke já manda o auth do usuário logado).

### Arquivos novos
1. **`src/pages/LojaRecebimentoOS.tsx`** — página com 2 abas (Pendentes / Já recebidas).
   - Pendentes: `select * from os_recebimento_loja where loja_nome in (<lojas do user_acessos>) and recebido_at is null order by data_movimentacao desc nulls last`.
   - Cada card: número OS, cliente, produto, data movimentação formatada, botão "Confirmar recebimento" com loading state.
   - Após sucesso: remove o card otimisticamente + toast.
   - Histórico: mesma query com `recebido_at is not null and recebido_at >= now() - interval '30 days'`.
2. **`src/hooks/useRecebimentoOSPendentes.ts`** — retorna `{ count, rows, loading, refetch }`, com canal realtime `os-recebimento` ouvindo `INSERT`/`UPDATE`/`DELETE` em `os_recebimento_loja` filtrado pelas lojas do usuário. Usado tanto pela página quanto pelo badge do menu.

### Arquivos alterados
3. **`src/App.tsx`** — rota `/recebimento-os` → `LojaRecebimentoOS`.
4. **`src/components/AppShell.tsx`** — novo item no menu (`PackageCheck` da lucide), `modulo: "menu_loja"`, com badge igual ao de mensagens (mostra `count` pendentes). Reutiliza o hook acima.

### Não vou mexer
- Backend externo (tabela, RLS, edge function, publicação realtime) — você confirmou que está pronto.
- `src/integrations/supabase/client.ts` (auto-gen-ish, projeto externo).
- Nada de push: você marcou como opcional e o `dispatch-push` deve ficar no backend, não no Messenger.

### Riscos
- Se algum nome de coluna divergir, a página vai dar erro de query no console — fix de 1 linha.
- Se a publicação `supabase_realtime` não estiver de fato com `os_recebimento_loja`, o realtime falha silencioso; a lista ainda funciona via refetch ao montar.

Posso seguir?