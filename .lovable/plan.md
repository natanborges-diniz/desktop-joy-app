## Destacar a seta de voltar no header da conversa (mobile)

No print, a seta `←` está sumindo atrás do **relógio do iOS** (status bar do sistema). O header tem `pt-safe`, mas o conteúdo (seta + avatar + nome) é renderizado todo na mesma linha, então a seta no canto esquerdo cai exatamente embaixo do horário.

Vou resolver com duas mudanças no `src/pages/ConversaDetail.tsx` (linhas 261–299):

### 1. Separar a faixa do safe-area do conteúdo do header

Hoje:
```tsx
<header className="... px-3 py-2.5 pt-safe ...">
  <Button>←</Button>
  <UserAvatar/>
  ...
</header>
```

Vai virar:
```tsx
<header className="... pt-safe ...">           // só reserva o espaço do notch/status bar
  <div className="flex items-center gap-2 px-2 py-2">  // conteúdo real do header, abaixo do status bar
    <Button>←</Button>
    <UserAvatar/>
    ...
  </div>
</header>
```

Assim o relógio do iOS fica na faixa reservada pelo `pt-safe` e a seta começa **abaixo** dele, totalmente visível.

### 2. Deixar a seta mais destacada

- Tamanho do botão: `h-11 w-11` (touch target confortável, ~44px iOS).
- Fundo translúcido permanente: `bg-white/20` + `hover:bg-white/30` + `active:bg-white/40` — cria um círculo claro contra o vermelho.
- Ícone maior e mais grosso: `ArrowLeft` em `h-6 w-6` com `strokeWidth={2.5}`.
- Posicionamento: `gap-2` e `px-2` no wrapper interno pra colar bem no canto esquerdo sem encostar na borda.

### Ajustes de espaço (responder ao "diminuir um pouco o campo de conversa")

- O wrapper interno usa `py-2` (em vez do `py-2.5` atual) — header fica ligeiramente mais compacto, sobrando 2–4px que somam à área de mensagens. A área da seta ganha respiro vertical ao mesmo tempo, porque agora não compete com a faixa do status bar.
- Sem mexer em `flex-1` do bloco de mensagens, sem alterar layout do desktop (`md:`), sem tocar na lógica de navegação (`Link to="/"`) nem em outros componentes.

### Resultado esperado

- Faixa preta do iOS (relógio/bateria) fica sobre o vermelho, sem encobrir nada interativo.
- Logo abaixo, a seta aparece dentro de um círculo branco translúcido bem destacado, fácil de tocar.
- Restante do header (avatar + nome + status) intacto.
