## Ajustes no chat (mobile) — `src/pages/ConversaDetail.tsx`

### 1. Cabeçalho — evitar sobreposição com a status bar
O `<header>` já usa `pt-safe` (padding-top do safe-area-inset), mas em alguns dispositivos isso é insuficiente / o navegador não expõe o inset (ex.: PWA standalone com notch). Vou reforçar o espaçamento superior:

- Adicionar um padding-top mínimo garantido além do `pt-safe`:
  - Trocar `pt-safe` por `pt-[max(env(safe-area-inset-top),0.75rem)]` no `<header>` (linha 261), garantindo no mínimo 12px mesmo quando o inset = 0.
- Aumentar levemente o padding vertical da linha do header de `py-2` para `py-2.5` (linha 262), dando mais respiro para o nome do contato e a seta de voltar.

Resultado: o nome "Natan Borges" e o botão de voltar ficam claramente abaixo da barra de status, sem sobreposição.

### 2. Largura máxima dos balões — confirmar 70% no mobile
A classe atual já é `max-w-[70%] ... md:max-w-[55%]` (linha 332), o que corresponde ao pedido. **Nenhuma alteração necessária aqui** — o requisito de 70% no mobile já está atendido.

### 3. Cores
- **Não alterar** nenhuma cor. Paleta atual de azuis (`bg-gradient-header`, `bubble-out`, `bubble-in`) permanece intacta.

### Arquivos alterados
- `src/pages/ConversaDetail.tsx` — apenas as classes do `<header>` (linhas 261–262).

### Observação ao usuário
Em PWAs já instalados na tela inicial, pode ser necessário fechar e reabrir o app para o novo padding entrar em vigor.
