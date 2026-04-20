

## Plano: configurar Web Push no Cloud do "Lovable Connect & Flow"

### Contexto descoberto

- **Infoco Messenger** (este projeto) → o Cloud novo (`xkyiciqlqpixmyrbzupg`) está vazio e não é usado. O app aponta pra `kvggebtnqmxydtwaumqz`.
- **Lovable Connect & Flow** (`2a6a2d63-...`) → seu Cloud É `kvggebtnqmxydtwaumqz`. Ele é o backend real deste app.
- Conclusão: pra criar tabela `push_subscriptions` e a edge function `send-test-push`, é só rodar no chat do **Lovable Connect & Flow**. Sem painel externo, sem copy-paste.

### O que eu vou te entregar agora

Um **prompt curto e direto** pra você colar no chat do Lovable Connect & Flow. Quando você aprovar este plano, mudo pra modo default e gero o prompt em formato copiável.

### O prompt vai pedir ao Lovable do outro projeto:

1. Criar tabela `public.push_subscriptions` com RLS (cada user só vê as próprias) — schema idêntico ao `supabase-setup/01_push_subscriptions.sql`.
2. Adicionar 3 secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (com valores prontos).
3. Criar edge function `send-test-push` com o código de `supabase-setup/02_send-test-push.ts`.
4. Confirmar deploy e me avisar pra você voltar aqui.

### Aqui no Infoco Messenger

Nada muda no código. Os arquivos em `supabase-setup/` viram referência interna (não precisam mais ser executados manualmente). Posso opcionalmente atualizar `supabase-setup/README.md` pra deixar claro que o setup foi feito via chat do outro projeto.

### Depois que rodar lá

Você publica este app aqui (**Publish → Update**), abre no celular, vai em **Perfil → Ativar notificações → Enviar teste**. Funciona.

### Próximo passo (Entrega 2)

Triggers automáticos (nova mensagem / demanda / aviso) também serão pedidos via prompt no Lovable Connect & Flow — pelo mesmo motivo: é lá que vivem as tabelas `mensagens_internas`, `demandas`, etc.

