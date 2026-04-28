## Objetivo

Permitir que o `Login.tsx` reconheça links de acesso enviados pelo Lovable Connect & Flow no formato:

```
/login?magic_token=...&email=...
```

Quando esses parâmetros estiverem presentes na URL, o Messenger deve validar o token via `supabase.auth.verifyOtp` e logar o usuário automaticamente.

## Mudanças

### `src/pages/Login.tsx`

1. **Imports adicionais** (no topo):
   - `useEffect` de `react`
   - `useSearchParams` de `react-router-dom`
   - `supabase` de `@/integrations/supabase/client`

2. **Dentro do componente `Login`**, logo após `const [submitting, setSubmitting] = useState(false);`:
   - Adicionar `const [searchParams, setSearchParams] = useSearchParams();`
   - Adicionar um `useEffect` (executa uma única vez no mount) que:
     - Lê `magic_token` e `email` da query string
     - Se ambos existirem, chama `supabase.auth.verifyOtp({ email, token, type: "magiclink" })`
     - Em caso de sucesso: toast de boas-vindas, limpa a URL via `setSearchParams({}, { replace: true })` para não vazar o token, navega para `/`
     - Em caso de erro: toast "Link de acesso inválido ou expirado" e log no console
     - Define `setSubmitting(true/false)` durante o processo para desabilitar o botão e mostrar spinner

3. **Cuidado com o early-return**: o bloco `if (!authLoading && session) return <Navigate.../>` está antes do `useEffect`. Como hooks não podem ficar abaixo de returns condicionais, o `useEffect` precisa ser declarado **antes** desse `if` (junto com o `useSearchParams`). Vou reorganizar mantendo a regra dos hooks.

## Detalhes técnicos

- O fluxo `verifyOtp` com `type: "magiclink"` cria a sessão automaticamente; o `AuthProvider` (já com `onAuthStateChange`) detectará e popula `session`/`profile`. O `navigate("/")` garante a saída da tela de login.
- A limpeza dos params via `setSearchParams({}, { replace: true })` evita que o token fique no histórico do navegador.
- Como o `useEffect` roda no mount com deps vazias, vou suprimir o warning do eslint-react-hooks com um comentário, mantendo o comportamento "uma única vez" pedido pelo snippet.
- Nenhuma mudança em `AuthProvider`, rotas ou backend é necessária — o token é emitido pelo projeto Lovable Connect & Flow e validado contra o mesmo Supabase compartilhado (`kvggebtnqmxydtwaumqz`).

## Fora do escopo

- Não criar tela de signup nem fluxo de recuperação de senha (assuntos anteriores ainda em aberto).
- Não alterar `.env` nem o `client.ts`.
