# Setup do Web Push — backend atrium-link

> **Status: ✅ CONCLUÍDO via chat do Lovable Connect & Flow.**
>
> Os arquivos deste diretório (`01_push_subscriptions.sql` e `02_send-test-push.ts`)
> ficam aqui apenas como **referência histórica** do que foi aplicado.
> **Não rode mais nada manualmente no painel do Supabase.**

## Por que isso mora em outro projeto Lovable

Este app (Infoco Messenger) usa o Supabase `kvggebtnqmxydtwaumqz` (atrium-link)
como backend. Esse mesmo Supabase é o **Lovable Cloud** do projeto
**Lovable Connect & Flow** (`2a6a2d63-e981-4d12-ac70-37d22a777184`).

Portanto, qualquer mudança de banco / edge function / secret desse Supabase
é feita **pelo chat do Lovable Connect & Flow**, não por aqui e não pelo
painel externo.

## O que já foi aplicado lá

1. ✅ Tabela `public.push_subscriptions` com RLS por usuário
   (schema = `01_push_subscriptions.sql`)
2. ✅ Secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
3. ✅ Edge function `send-test-push` deployada
   (código = `02_send-test-push.ts`)

## Como testar (faça aqui no Infoco Messenger)

1. **Publish → Update** neste projeto
2. Abra `https://desktop-joy-app.lovable.app` no celular
   - **iPhone**: Safari → Compartilhar → "Adicionar à Tela de Início" → abra o app instalado
   - **Android**: Chrome → menu → "Instalar app"
3. Faça login → **Perfil** → **"Ativar notificações"** → permita
4. **"Enviar teste"** → notificação chega em 1-3s

## Próximas entregas (também via Lovable Connect & Flow)

Triggers automáticos de push em:
- Nova mensagem em conversa
- Demanda atribuída
- Novo aviso/notificação

O prompt para isso será gerado aqui no chat do Infoco Messenger e colado
no chat do Lovable Connect & Flow — mesmo fluxo da Entrega 1.
