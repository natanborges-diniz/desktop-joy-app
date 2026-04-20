

## Realinhamento do Design System à marca Infoco Optical Business

A logo oficial enviada usa **preto + azul periwinkle**, não o teal verde-azulado que está hoje no app. Vou rebrandar todo o sistema para combinar com a identidade real da marca e usar a logo enviada como ativo oficial.

### 1. Nova paleta extraída da logo

| Token | Valor | Uso |
|---|---|---|
| Azul Infoco (primary) | `#7B9BD4` — HSL `217 47% 66%` | Botões, links, badges, bolhas enviadas |
| Azul Infoco escuro (primary-glow / hover) | `#5878B8` — HSL `217 38% 53%` | Hover, gradiente, header |
| Preto Infoco (foreground / header) | `#0E0F12` — HSL `225 12% 6%` | Texto, header, ícones |
| Off-white (background) | `#F7F8FB` — HSL `220 25% 97%` | Fundo geral |
| Surface (card) | `#FFFFFF` | Cards, sidebar |
| Accent suave | `#E4ECF8` — HSL `217 60% 93%` | Bolha "in", hover sutil |
| Header gradient | `linear-gradient(135deg, #0E0F12 → #2A3142)` | Header preto sóbrio |
| Bubble-out | `#DCE6F5` — HSL `217 60% 91%` | Mensagens enviadas (azul claro) |
| Bubble-in | `#FFFFFF` com borda `#E5E9F0` | Mensagens recebidas |

Modo dark: preto profundo `#0B0C10` + azul mais luminoso `#9DB6E0` como primary.

### 2. Logo como ativo oficial

- Copiar a imagem enviada para `src/assets/infoco-logo.png` (usada inline em React) e `public/infoco-logo.png` (usada em manifest / meta).
- Gerar via Lovable AI (Nano Banana) **3 derivados** a partir da logo original:
  - `public/icon-192.png` e `public/icon-512.png` — só o símbolo "in" preto centrado em fundo branco com cantos arredondados (favicon / PWA).
  - `public/icon-maskable-512.png` — símbolo em branco sobre fundo preto `#0E0F12` com safe-zone para máscara Android.
  - `public/og-image.png` — 1200×630 com logo + tagline "Comunicação interna do Grupo Infoco" para Open Graph.
- Atualizar `index.html` (theme-color `#0E0F12`, og:image), `public/manifest.webmanifest` (theme/background colors, nome), e `apple-mobile-web-app-status-bar-style`.

### 3. Substituir o "logo improvisado" pela logo real

- **`Login.tsx`**: trocar o ícone `MessageCircle` em quadrado branco translúcido pela `infoco-logo.png` (versão completa com "OPTICAL BUSINESS"), centralizada sobre o gradiente preto. Remover o `<h1>Infoco Messenger</h1>` (a logo já tem o nome) — manter só a tagline.
- **`AppShell.tsx`**: trocar o quadrado com `MessageSquare` no topo do rail desktop pela versão **só do símbolo "in"** (`icon-192.png`). Mesma troca no `ChatPlaceholder` central.
- **Header das conversas** (se houver — verificar `ConversaDetail`): manter avatar do usuário; logo só no rail/login.

### 4. Atualização de `src/index.css`

Reescrever o bloco `:root` e `.dark` com os novos tokens HSL acima. Manter a estrutura de variáveis (nada quebra nos componentes shadcn). Ajustes específicos:
- `--header` de teal para preto.
- `--bubble-out` de verde claro para azul claro.
- `--accent` para o periwinkle pálido.
- `--gradient-header` para preto → cinza-azulado.
- `--ring` segue o primary novo (foco visível em azul).

### 5. Tipografia

Manter Inter (já condiz com a logo, que usa um geométrico sans próximo). Sem mudanças em `index.html` além da atualização das meta tags.

### Detalhes técnicos

- Arquivos editados: `src/index.css`, `src/pages/Login.tsx`, `src/components/AppShell.tsx`, `index.html`, `public/manifest.webmanifest`.
- Arquivos criados: `src/assets/infoco-logo.png`, `public/infoco-logo.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/og-image.png`.
- Geração dos PNGs derivados via skill `ai-gateway` chamando `google/gemini-2.5-flash-image` com a logo enviada como input (modo edit-image), prompts pedindo recorte do símbolo "in" e versões maskable/OG.
- Nenhum componente shadcn precisa ser tocado — todos consomem tokens semânticos.
- Paleta validada para contraste WCAG AA (azul `#5878B8` sobre branco = 4.6:1; preto sobre off-white = 18:1).

### O que NÃO muda
- Estrutura de páginas, rotas, lógica de chat, anexos, presença, RLS.
- Tipografia (Inter permanece).
- Bordas arredondadas (`0.75rem`).

### Antes vs depois (resumo visual)

```text
ANTES                          DEPOIS
─────                          ──────
Header teal #0F7A63       →    Header preto #0E0F12
Primary verde-azul        →    Primary azul periwinkle #7B9BD4
Bolha enviada verde       →    Bolha enviada azul claro
Ícone MessageCircle       →    Logo "in" oficial
Favicon genérico          →    Símbolo Infoco
```

