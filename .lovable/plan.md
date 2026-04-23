
## Tornar a seta de voltar mais visível na tela de conversa

Hoje, no header da conversa (mobile), a seta `←` é desenhada com `h-5 w-5` em cima do gradiente vermelho, sem fundo nem traço mais forte — fica discreta e fácil de não notar (como aparece no seu print).

### Mudanças (arquivo único: `src/pages/ConversaDetail.tsx`, linhas 262–271)

Ajustar o botão de voltar para:

- **Ícone maior e mais grosso**: `ArrowLeft` passa de `h-5 w-5` → `h-6 w-6` com `strokeWidth={2.5}`.
- **Fundo translúcido permanente** (não só no hover): `bg-white/15` + `hover:bg-white/30` + `active:bg-white/40` — cria um "círculo" claro contra o vermelho.
- **Área de toque maior**: `h-10 w-10` (em vez do `size="icon"` padrão de 9×9), respeitando os 44px recomendados pra touch em iOS.
- **Margem à esquerda**: `-ml-1` pra colar bem no canto sem encostar na borda.

Sem mudar a lógica de navegação (continua `Link to="/"`), sem mexer no desktop (segue `md:hidden`), sem alterar nenhum outro componente.

### Resultado visual

Antes: seta fina solta no vermelho.
Depois: seta grossa dentro de um botão circular branco-translúcido bem destacado no canto esquerdo.
