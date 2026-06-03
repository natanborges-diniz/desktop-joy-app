## Problema

No iPhone (PWA / Safari), o banner vermelho "Você tem X avisos pendentes" fica colado no topo da tela e é cortado pelo notch / Dynamic Island, escondendo o texto e o botão "Ver avisos".

Causa: em `src/components/PendenciasBanner.tsx`, o banner usa `sticky top-0` sem nenhum padding para `env(safe-area-inset-top)`. Como ele é o primeiro elemento renderizado dentro do `<main>` do `AppShell`, nada o protege da área do notch.

## Correção

Arquivo: `src/components/PendenciasBanner.tsx`

- Adicionar `pt-safe` (utilitário já usado no projeto, ex.: bottom nav em `AppShell`) à classe do banner, para empurrar o conteúdo abaixo da `safe-area-inset-top` no iOS.
- Manter `py-2` para o espaçamento interno padrão; o `pt-safe` adiciona o offset do notch acima desse padding.

Resultado esperado: o ícone do sino, o texto "Você tem N avisos pendentes. Resolva agora." e o botão "VER AVISOS" passam a aparecer completos abaixo da Dynamic Island / status bar no iPhone, sem cortes.

Escopo: apenas estilo/CSS no componente do banner. Sem mudanças em lógica, dados ou outras telas.
