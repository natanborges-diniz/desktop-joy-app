## Reverter ícone e renomear para "InFoco Message"

Para o ícone anterior, recomendo usar o botão **Revert** na mensagem do chat onde o ícone foi trocado (era o jeito mais seguro de recuperar o arquivo original do `DiniZap2.jpeg`). Como alternativa, se você reenviar o ícone antigo aqui, eu copio para `public/`.

```xml
<lov-actions>
  <lov-open-history>Ver histórico</lov-open-history>
</lov-actions>
```

### Renomear "DiniZap" → "InFoco Message"

Strings visíveis ao usuário a serem atualizadas:

- **`index.html`**
  - `<title>`: `InFoco Message — Comunicação interna`
  - `apple-mobile-web-app-title`: `InFoco Message`
  - `meta description`, `og:title`, `twitter:title`, `og:description`, `twitter:description`: trocar `DiniZap` por `InFoco Message`
  - `meta author`: `InFoco Message`

- **`public/manifest.webmanifest`**
  - `name`: `InFoco Message`
  - `short_name`: `InFoco` (limite recomendado de 12 caracteres para home screen)
  - `description`: `InFoco Message: comunicação interna, demandas e notificações.`

- **`src/hooks/useDocumentTitleBadge.ts`**: default `baseTitle` → `InFoco Message`

- **`src/sw.ts`**: título padrão da notificação push → `InFoco Message`

- **`src/pages/Login.tsx`**: nome exibido no header (`<h1>`) → `InFoco Message`

- **`src/pages/Perfil.tsx`**, **`src/components/AppShell.tsx`**, **`src/components/ConversasSidebar.tsx`**: substituir ocorrências visíveis de `DiniZap` por `InFoco Message`.

### Não muda

- Cores do tema (`#D62828`) permanecem.
- URL publicada (`desktop-joy-app.lovable.app`) e nome do projeto Lovable não são alterados pelo código.
- iPhone/Android com app já instalado na home: precisa remover e reinstalar para ver o nome novo.

### Pergunta

Você quer que eu já avance com o rename agora e você reverte o ícone pelo histórico em paralelo? Ou prefere reenviar o ícone antigo para eu fazer tudo de uma vez?
