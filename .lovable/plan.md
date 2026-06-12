## Objetivo
Restaurar o push notifications adicionando a chave VAPID pública ao `.env` deste projeto.

## Mudança
Adicionar uma única linha ao `.env`:

```
VITE_VAPID_PUBLIC_KEY=BGi2gNRP8_4mYwoFYbrLgRWsnxq7QM7Klhywz-FmPQYwP86sVzoqYoUGozT-8qjFrkPVAA8rfvmuVo020HyglYI
```

Essa é uma chave pública — pode ficar no `.env` versionado sem risco. A privada (`VAPID_PRIVATE_KEY`) continua só no backend antigo (`kvggebtnqmxydtwaumqz`), que é quem assina e envia os pushes.

## Por que isso resolve
- `src/lib/push.ts` lê `import.meta.env.VITE_VAPID_PUBLIC_KEY` para chamar `pushManager.subscribe({ applicationServerKey })`.
- Sem ela, o navegador não consegue criar a `PushSubscription` → erro "Não foi possível ativar o push agora".
- Com ela presente, o fluxo volta a ser: pedir permissão → criar subscription → gravar em `push_subscriptions` no backend antigo (onde a tabela e a chave privada existem) → `send-push` consegue entregar.

## Validação
1. Após restart do dev server (Vite recarrega `.env`), recarregar a app.
2. Clicar na barra amarela "Ativar push".
3. Esperado: prompt de permissão do navegador → toast de sucesso → linha nova em `push_subscriptions` no backend antigo.
4. Se falhar, abrir DevTools → Console e Network para ver se o erro vem de `subscribe()` (chave) ou do insert (RLS/sessão).

## Fora de escopo
- Não mexer em `src/integrations/supabase/client.ts` (continua apontando pro backend antigo, que é onde tudo funciona).
- Não recriar tabelas nem edge functions neste Cloud novo.
- Não rotacionar VAPID — usaremos as chaves existentes.
