## Diagnóstico

O erro **"Failed to send a request to the Edge Function"** acontece porque:

- `src/integrations/supabase/client.ts` aponta para `kvggebtnqmxydtwaumqz` (o backend compartilhado com o Atrium‑link).
- A função `proxy-loja-acao-agendamento` foi deployada em `xkyiciqlqpixmyrbzupg` (Lovable Cloud deste projeto), num backend que o messenger nem usa.
- `supabase.functions.invoke("proxy-loja-acao-agendamento")` busca a função em `kvggebtnqmxydtwaumqz` → 404.

Além disso, o proxy era desnecessário desde o início: a `loja-acao-agendamento` no projeto Atrium‑link já aceita **JWT do Atrium** (modo 1 — Authorization: Bearer), e os usuários do messenger são exatamente os mesmos `auth.users` do Atrium. Só precisa chamar direto.

## Mudanças

1. **`src/hooks/useAcaoAgendamento.ts`** — trocar `"proxy-loja-acao-agendamento"` de volta para `"loja-acao-agendamento"` (linha 25).

2. **Remover `supabase/functions/proxy-loja-acao-agendamento/`** — função órfã, não tem como ser alcançada pelo client.

3. **`supabase/config.toml`** — remover o bloco `[functions.proxy-loja-acao-agendamento]`.

4. **Secret `INTERNAL_SERVICE_SECRET`** — pode ser removido depois do Lovable Cloud deste projeto (não é usado por nada aqui); deixo essa exclusão para você fazer quando confirmar que nenhuma outra função local depende.

## Validação

Após aplicar, clicar em **Registrar** no card "Registrar venda fechada" deve chamar `kvggebtnqmxydtwaumqz/functions/v1/loja-acao-agendamento` com o JWT do usuário logado e responder `{ ok: true, status: "venda_fechada" }`. Se quiser, eu acompanho os logs depois pra confirmar.
