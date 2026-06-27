## Problemas atuais (visíveis no print)

1. **Barra vermelha de "avisos pendentes"** começa em `top: 0` e fica embaixo do notch/Dynamic Island, status bar (hora, bateria, sinal) — texto sobreposto, botão "Ver avisos" inalcançável.
2. **Bottom nav móvel** tem 10 itens (Conversas, Agenda, Demandas, Minhas lojas, Abrir, Minhas, Recebimento, Cashback, Avisos, Perfil) espremidos em uma linha — labels se sobrepõem ("ConversasAgendaDemandas…", "RecebimentoCashback…").
3. **Rail desktop** mostra só ícones, sem label nem tooltip ao passar o mouse — fica adivinhação.

## Plano

### 1. Safe-area no topo (iOS notch + Android status bar)

**`src/components/PendenciasBanner.tsx`**
- Hoje: `sticky top-0 … pt-safe`. O `pt-safe` adiciona padding interno, mas o conteúdo (ícone + texto + botão) ainda começa na linha 0 visual quando a status bar é translúcida. Trocar por `padding-top: calc(env(safe-area-inset-top) + 0.5rem)` real e garantir altura mínima depois da safe-area.
- Mesma correção para qualquer outro banner sticky no topo: `UpdateAvailableBanner` e `PushOnboardingBanner`.

**`index.html`**
- Confirmar `<meta name="viewport" content="… viewport-fit=cover">` (necessário para `env(safe-area-inset-top)` retornar valor real no iOS PWA).
- Confirmar `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` — sem isso o iOS reserva espaço próprio e o efeito muda.

**`src/index.css`**
- Adicionar utilitário `.safe-top` = `padding-top: max(env(safe-area-inset-top), 0.5rem)` para reuso.

### 2. Bottom nav móvel — reduzir para 5 itens + "Mais"

Padrão consagrado (iOS/Android): no máximo 5 slots no tab bar. Hoje são até 10 itens condicionais.

**Proposta de slots fixos (mobile):**

| Slot | Item | Visível para |
|---|---|---|
| 1 | Conversas | chat_1a1 ou chat_grupo |
| 2 | Demandas | menu_loja (ou Minhas lojas para supervisão) |
| 3 | Abrir (+) | menu_loja — botão central destacado |
| 4 | Avisos | todos |
| 5 | Mais | todos — abre Sheet/Drawer |

O **"Mais"** abre um `Sheet` (shadcn) inferior listando os itens que sobraram: Agenda, Minhas lojas, Minhas demandas, Recebimento, Cashback, Perfil — com ícone + label completos, em lista vertical confortável.

Regras:
- Se o usuário tem ≤5 itens elegíveis no total, mostra todos direto (sem "Mais").
- Item "Abrir" continua destaque visual (cor primária, levemente elevado), como hoje.
- Badge de não-lidas continua em "Conversas".
- Badge agregado de "tem coisa nova" aparece em "Mais" quando algum item escondido tem pendência.

**Arquivos:**
- `src/components/AppShell.tsx`: refatorar `baseItems` em `primaryItems` (5 slots) e `secondaryItems`. Mobile renderiza primary + botão "Mais". Desktop continua renderizando tudo no rail.
- Novo `src/components/MoreMenuSheet.tsx`: Sheet com a lista dos secundários.

### 3. Rail desktop — labels ao hover

**`src/components/AppShell.tsx`**
- Envolver cada `NavLink` do rail em `Tooltip` (shadcn já instalado: `src/components/ui/tooltip.tsx`) com `side="right"`, mostrando o `label` no hover.
- Alternativa adicional (opcional): rail expansível ao hover (de `w-16` para `w-48` com `transition-[width]`), revelando os labels inline. Marcar como opção B no implementar — começamos com tooltip por ser mais leve e previsível.
- Envolver o rail inteiro em `<TooltipProvider delayDuration={150}>`.

### 4. Pequenos ajustes de consistência

- Os labels truncados no print ("Recebime", "Cashback", "Conversas") confirmam que mesmo com 5 itens o texto precisa de `truncate` + `text-[10px]` ou esconder label quando não couber. Definir: até 5 itens → ícone + label; o "Mais" sempre tem label "Mais".
- Manter `pb-safe` no bottom nav (já existe) para respeitar home indicator do iPhone.

## Não vou mexer

- Conteúdo das páginas, rotas, autenticação, backend, upload de anexo, push — escopo é só layout/navegação.
- Cores e tipografia globais.

## Riscos

- Mudar status bar para `black-translucent` muda a aparência em PWAs já instalados (status bar fica sobre o header escuro). Como o header já é escuro (`bg-gradient-header`), o efeito é desejado.
- Usuários acostumados com Cashback/Agenda no bottom precisarão clicar em "Mais" — ganho de usabilidade compensa.

Posso seguir?
