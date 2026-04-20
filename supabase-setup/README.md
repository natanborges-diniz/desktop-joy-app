# Setup manual no Supabase atrium-link

O Lovable Cloud foi ativado num projeto novo, mas o app continua usando o **Supabase atrium-link** (`kvggebtnqmxydtwaumqz`) para preservar conversas, perfis, demandas. Por isso, os passos abaixo precisam ser feitos **manualmente** no painel desse projeto.

## 1. Rodar a migration

1. Abra https://supabase.com/dashboard/project/kvggebtnqmxydtwaumqz/sql/new
2. Cole o conteúdo de [`01_push_subscriptions.sql`](./01_push_subscriptions.sql)
3. Clique em **Run**

Cria a tabela `push_subscriptions` com RLS — cada usuário só acessa suas próprias.

## 2. Adicionar os secrets VAPID

Em **Project Settings → Edge Functions → Secrets**, adicione:

| Nome | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | `BGi2gNRP8_4mYwoFYbrLgRWsnxq7QM7Klhywz-FmPQYwP86sVzoqYoUGozT-8qjFrkPVAA8rfvmuVo020HyglYI` |
| `VAPID_PRIVATE_KEY` | `qkcC4LWziEu4K-EbSE6wpXCZZOzzZZF-02IqFrJo9XM` |
| `VAPID_SUBJECT` | `mailto:contato@infoco.com.br` *(troque pelo e-mail oficial)* |

⚠️ **A chave privada nunca pode vazar.** Não comite em repositório público.
A pública já está hard-coded no `vite.config.ts` — é seguro, ela é pública por design.

## 3. Criar a edge function `send-test-push`

1. Em **Edge Functions → Create a new function**, nome: `send-test-push`
2. Cole o conteúdo de [`02_send-test-push.ts`](./02_send-test-push.ts)
3. **Deploy**

A function valida a JWT do usuário, busca as assinaturas dele e envia uma notificação de teste.

## 4. Publicar o app

No Lovable, clique em **Publish → Update**.
O Service Worker novo só ativa em produção (`https://desktop-joy-app.lovable.app`), nunca no editor.

## 5. Testar no celular

1. Abra `https://desktop-joy-app.lovable.app` no celular
2. **iPhone**: Safari → Compartilhar → "Adicionar à Tela de Início" → abra o app instalado
3. **Android**: Chrome → menu → "Instalar app"
4. Faça login → vá em **Perfil** → toque em **"Ativar notificações"** → permita
5. Toque em **"Enviar teste"** → notificação deve chegar em 1-3s

## Próxima entrega

Triggers automáticos para disparar push em:
- Nova mensagem em conversa
- Demanda atribuída
- Novo aviso/notificação
