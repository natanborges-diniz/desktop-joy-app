

## Trocar ícone e nome do app para "DiniZap"

### Ícone (usando `DiniZap2.jpeg`)

- Copiar `user-uploads://DiniZap2.jpeg` para:
  - `public/favicon.png`
  - `public/icon-192.png`
  - `public/icon-512.png`
  - `public/icon-maskable-512.png`
- Apagar `public/favicon.ico` (senão o navegador prioriza o antigo).
- Em `index.html`, adicionar `<link rel="icon" href="/favicon.png" type="image/png">` e trocar `apple-mobile-web-app-title` de `"Infoco"` para `"DiniZap"`.

### Nome do app

- **`index.html`**: `<title>` e meta `og:title` / `twitter:title` → `"DiniZap — Comunicação interna"`. Atualizar `description`/`og:description` removendo "Infoco Messenger".
- **`public/manifest.webmanifest`**:
  - `name`: `"DiniZap"`
  - `short_name`: `"DiniZap"`
  - `description`: atualizar removendo "Grupo Infoco"
  - `theme_color` e `background_color`: vermelho do logo (`#D62828`)
- **`src/hooks/useDocumentTitleBadge.ts`**: trocar default `baseTitle` de `"Atrium Messenger"` para `"DiniZap"`.
- **Buscar e substituir** outras ocorrências visíveis de "Infoco" / "Infoco Messenger" na UI (ex.: `AppShell`, `Login`, `Perfil`) para "DiniZap". Não tocar em nomes de tabelas, projetos Cloud ou comentários técnicos — só strings exibidas ao usuário.

### Observações

- iPhone com app já instalado na home **não atualiza ícone nem nome** automaticamente: precisa remover da tela de início e reinstalar (Compartilhar → Adicionar à Tela de Início).
- No navegador desktop, pode ser necessário hard-refresh (Cmd/Ctrl+Shift+R) pra ver o favicon novo.
- Não vou renomear o repositório nem URLs de publicação (`desktop-joy-app.lovable.app`) — isso é feito em Settings, fora do código.

