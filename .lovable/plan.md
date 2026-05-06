# Alertas insistentes para zerar notificações

Hoje as notificações ficam silenciosas na aba **Avisos** — a loja pode ignorar. Vamos forçar a leitura com dois mecanismos combinados:

## 1. Banner fixo no topo (persistente)

Novo componente `PendenciasBanner` renderizado dentro do `AppShell`, **acima do `<main>`**, visível em **todas as rotas** (Conversas, Agenda, Demandas, Perfil, etc.).

Comportamento:
- Conta `notificacoes` com `usuario_id = user.id` e `lida = false` (qualquer `tipo`, conforme pedido).
- Se contagem > 0:
  - Faixa vermelha (`bg-destructive text-destructive-foreground`) full-width, sticky.
  - Texto: **"Você tem N aviso(s) pendente(s). Resolva agora."**
  - Botão **"Ver avisos"** que navega para `/notificacoes`.
  - Ícone de sino pulsando (animação `animate-pulse`).
- Se contagem = 0: não renderiza nada.
- Atualiza em tempo real via Supabase Realtime no canal já existente (`useNotificacoesRealtime`) — vamos expor a contagem via novo hook `usePendenciasCount` (espelha o padrão de `useUnreadCount`).

## 2. Lembrete recorrente a cada 15 minutos

Novo hook `usePendenciasReminder` montado no `AppShell`:
- `setInterval` de **15 minutos**.
- A cada tick, se `pendenciasCount > 0`:
  - Dispara `showLocalNotification` com:
    - title: "Você tem N avisos pendentes"
    - body: "Toque para resolver agora"
    - url: `/notificacoes`
    - tag: `"pendencias-reminder"` (substitui a anterior, sem empilhar)
  - **Suprimido** se a aba estiver visível em `/notificacoes` (o usuário já está resolvendo) — usando `suppressWhenOnPathPrefixes: ["/notificacoes"]` que já existe em `localNotify.ts`.
- Limpa o intervalo no unmount / logout.
- Não dispara enquanto `Notification.permission !== "granted"` (já tratado pelo `localNotify`).

## 3. Ajustes finos

- Banner também cabe em mobile: respeitar `pt-safe` apenas no header existente; banner fica entre header e main, sem quebrar a bottom nav.
- Z-index alto para nunca ser coberto por dialogs internos do conteúdo.
- Link do banner usa `react-router` `useNavigate`, não recarrega.

## Arquivos

**Novos:**
- `src/hooks/usePendenciasCount.ts` — query + realtime sub para `notificacoes` não lidas do usuário.
- `src/hooks/usePendenciasReminder.ts` — `setInterval` de 15min com `showLocalNotification`.
- `src/components/PendenciasBanner.tsx` — UI do banner.

**Editados:**
- `src/components/AppShell.tsx` — montar hook do reminder e renderizar `<PendenciasBanner />` acima do `<main>`.

## Fora de escopo

- Não bloqueia navegação (você escolheu "banner fixo", não "bloqueio").
- Não toca em RLS / schema do banco.
- Não muda a edge function `loja-acao-agendamento`.
- Backfill de notificações antigas: não.
