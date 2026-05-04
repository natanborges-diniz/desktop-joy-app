
# Push automático para mensagens, avisos e agendamentos

## Situação atual

A base de Web Push **já está pronta** e funcionando manualmente:

- Tabela `push_subscriptions` no Supabase compartilhado (atrium-link / `kvggebtnqmxydtwaumqz`), com RLS por usuário.
- Secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` configurados lá.
- Edge function `send-test-push` em produção — botão "Enviar teste" em **Perfil** já entrega push real no celular.
- Service Worker (`src/sw.ts`) trata `push` e `notificationclick` (foca/abre janela na URL certa).
- `useAppBadge` sincroniza o badge do ícone do app (Android/desktop).

**O que falta**: o push só dispara hoje quando o usuário clica em "Enviar teste". Precisa disparar **automaticamente** quando:

1. Chega **mensagem interna** numa conversa (`public.mensagens_internas`).
2. Chega **aviso/notificação** do sistema (`public.notificacoes`).
3. **Agendamento** é criado para uma loja (`public.agendamentos`).

## Onde cada coisa é feita

O backend é o Supabase do projeto **Lovable Connect & Flow** (ref `kvggebtnqmxydtwaumqz`), não o Cloud deste app. Então a entrega é em duas partes:

- **Parte A (aqui no Messenger)** — eu implemento direto.
- **Parte B (Connect & Flow)** — eu gero **um único prompt pronto** para você colar no chat de lá, igual à entrega 1. Sem mexer em painel.

---

## Parte A — Mudanças neste projeto (Messenger)

Mínimas. Push verdadeiro do SO vem do backend; aqui só melhoro a experiência quando o app está aberto.

1. **`src/lib/localNotify.ts` (novo)** — helper `showLocalNotification({title, body, url, tag})` que:
   - Só dispara se `Notification.permission === "granted"`.
   - **Não** dispara se a aba do app está visível na rota relevante (evita duplicar quando o usuário já está olhando a conversa/agenda).
   - Usa `registration.showNotification` para passar pelo SW (mesmo `notificationclick` da push real).

2. **`src/hooks/useUnreadCount.ts` (editado)** — no callback do Realtime de `INSERT` em `mensagens_internas` para o usuário atual, chamar `showLocalNotification` com título "Nova mensagem" e URL `/conversas/<remetente_id>`.

3. **`src/hooks/useNotificacoesRealtime.ts` (novo)** — sub Realtime em `public.notificacoes` filtrando por `user_id = auth.uid()`; dispara `showLocalNotification` no INSERT. Consumido por `NotificacoesList` e por `AppShell` (para funcionar em qualquer tela).

4. **`src/pages/LojaAgenda.tsx` (editado)** — sub Realtime em `agendamentos` da loja atual; INSERT → `showLocalNotification` "Novo agendamento: <título>" com URL `/agenda`.

5. **`src/pages/Perfil.tsx` (editado, leve)** — texto de status mais claro: "Notificações ativas neste dispositivo" / "Bloqueadas pelo navegador" / "Instale o app na tela inicial (iOS)". Sem mudança estrutural.

Nada é deletado. `src/sw.ts`, `src/lib/push.ts`, `src/main.tsx`, manifest e rotas ficam intactos.

---

## Parte B — Prompt para colar no Lovable Connect & Flow

Vou gerar um único bloco com tudo abaixo, pronto para colar lá. Resumo do que ele faz:

### B.1 Edge function nova: `send-push-to-user`

Genérica e reutilizável. Recebe:

```json
{ "user_id": "<uuid>", "title": "...", "body": "...", "url": "/...", "tag": "..." }
```

Valida header `x-internal-secret` contra `INTERNAL_PUSH_SECRET` (novo). Busca `push_subscriptions` do `user_id` via service role, envia com `web-push`, limpa subs `404/410`. Mesmo padrão da `send-test-push` existente.

### B.2 Triggers `AFTER INSERT` (chamam a edge via `pg_net.http_post`)

1. **`mensagens_internas`** → push para `destinatario_id`
   - title: nome do remetente (lookup em `profiles`)
   - body: primeiros 120 chars de `conteudo`
   - url: `/conversas/<remetente_id>`
   - tag: `msg-<remetente_id>` (agrupa conversas)

2. **`notificacoes`** → push para `user_id`
   - title: `titulo`
   - body: `mensagem`
   - url: `/notificacoes`
   - tag: `notif-<id>`

3. **`agendamentos`** → push para os usuários da **loja** do agendamento (lookup do membership da loja)
   - title: `"Novo agendamento"`
   - body: título + data formatada (`DD/MM HH:mm`)
   - url: `/agenda`
   - tag: `ag-<id>`

### B.3 Secret novo

`INTERNAL_PUSH_SECRET` — string aleatória, usada como header pelos triggers e validada pela edge.

**Não inclui** lembrete antes do horário (cron) — fica para uma próxima entrega se você quiser.

---

## Entrega faseada

1. **Agora**: aplico a Parte A. Já melhora muito quando o app está aberto/em background com a aba viva.
2. **Quando você colar a Parte B no Connect & Flow**: push real do SO chega com **app fechado**.

## Como testar (depois das duas partes)

- PWA instalada no celular, **Perfil → Ativar notificações**.
- Pedir outro usuário enviar mensagem → push chega com app fechado.
- Inserir linha em `notificacoes` para esse usuário → push chega.
- Criar agendamento para a loja → todos os usuários daquela loja recebem push.
- Com a conversa aberta e visível, **não** duplica notificação local.

## Riscos

- iOS: push só funciona com PWA instalada na tela inicial (iOS 16.4+). Já documentado em Perfil.
- Trigger 3 depende de existir uma forma de saber "quem são os usuários da loja". Se a tabela de membership tiver outro nome, eu ajusto no prompt da Parte B antes de enviar.
