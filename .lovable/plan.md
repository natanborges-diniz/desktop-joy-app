# As conversas sumiram — corrigir o probe de colunas

## Diagnóstico

O fallback que adicionei em `src/lib/mensagensColumns.ts` está com a lógica invertida:

```ts
cached = !error || error.code !== "42703";
```

Se o probe retorna **qualquer outro erro** (RLS, 401, rede momentânea, etc.), `cached` vira `true` — e aí o `select` real é feito **com** `editada_em,apagada_em`, que não existem no banco externo. Resultado: erro 400, `load()` faz `return` silencioso, e a sidebar fica vazia → "as conversas sumiram".

Além disso, em `ConversasSidebar.tsx` e `ConversaDetail.tsx` o `load()` apenas faz `return` quando dá erro, sem `console.error` nem fallback — então o sintoma é mudo.

## Correções (todas frontend, sem tocar no banco)

### 1. `src/lib/mensagensColumns.ts`
- Inverter a lógica: `cached = true` **somente** quando `error` é `null`. Em qualquer erro (incluindo `42703`), `cached = false` (usa apenas `BASE_COLUMNS`).
- Não cachear erros transitórios para sempre: se o erro **não** for `42703`, deixar `cached = false` mas **não memoizar** — assim, na próxima chamada tenta de novo.

### 2. `src/components/ConversasSidebar.tsx` (função `load`)
- Logar o erro com `console.error("[ConversasSidebar] load mensagens", error)` para diagnóstico futuro.
- Se o `select` falhar com `42703` (colunas inexistentes), invalidar o cache do probe e refazer a query com `BASE_COLUMNS`. Assim, mesmo que o probe tenha errado, a lista volta a aparecer.

### 3. `src/pages/ConversaDetail.tsx`
- Mesma proteção: log + retry com `BASE_COLUMNS` em caso de `42703`.

### Out of scope
- Não mexer no banco externo nem na UI de editar/apagar — quando a migração rodar, o probe passa e os botões reaparecem automaticamente.
