## Objetivo

Adicionar uma etapa de **revisão inline** em `LojaNovaDemanda.tsx` para que, ao clicar em **"Enviar solicitação"**, o usuário veja um resumo de todos os dados preenchidos e possa **voltar e editar** ou **confirmar e gerar** — válido para todos os fluxos (incluindo `gerar_boleto`).

## Comportamento

Fluxo atual: formulário → clica Enviar → chama edge function → tela de resultado.

Fluxo novo: formulário → clica **Revisar** → tela de revisão (mesma página, substitui o formulário) → **Confirmar e gerar** → chama edge function → tela de resultado.

A tela de revisão mostra:
- Nome do fluxo no topo (ex: "Gerar boleto").
- Lista vertical de cada etapa: rótulo do campo + valor formatado.
  - CPF: aplicar máscara `000.000.000-00`.
  - Valor / decimal: formatar em BRL via `formatarBRL`.
  - Imagens/anexos: mostrar miniatura + nome do arquivo (quantos foram anexados).
  - Campos vazios opcionais: mostrar "—".
- No fluxo `gerar_boleto`: destacar no topo o card da Consulta de CPF aprovada selecionada (protocolo, cliente, CPF mascarado, valor) já que esses campos vêm travados do servidor.
- Dois botões no final:
  - **Voltar e editar** (variant outline) — volta para o formulário com todos os dados preservados.
  - **Confirmar e gerar** (primário, com loading) — dispara o envio real.

## Mudanças técnicas (apenas em `src/pages/LojaNovaDemanda.tsx`)

1. **Novo estado** `revisando: boolean` (default `false`).
2. **Renomear** o botão atual "Enviar solicitação" para **"Revisar dados"**. Seu `onClick` passa a chamar uma nova função `irParaRevisao()` que executa apenas a validação atual (o bloco de `novosErros` que hoje está dentro de `enviar()`) e, se passar, faz `setRevisando(true)`.
3. **Refatorar `enviar()`**: remover a parte de validação (movida para `irParaRevisao`) e manter só a montagem do payload + `supabase.functions.invoke(...)` + `setResultado`. Será chamada apenas pelo botão "Confirmar e gerar".
4. **Novo bloco de UI** (renderizado quando `fluxoAtivo && revisando && !resultado`, substituindo o formulário):
   - Card com resumo dos campos (iterando `fluxoAtivo.etapas` e lendo `dados[campo]` / `anexos[campo]`).
   - Se `fluxoAtivo.chave === "gerar_boleto"`, mostrar primeiro o card da `consultaCpfSelecionada` (reaproveitar a formatação já existente nas linhas ~607-700).
   - Botão "Voltar e editar" → `setRevisando(false)`.
   - Botão "Confirmar e gerar" → `enviar()`, com `disabled={enviando}` e ícone `Loader2` enquanto envia.
5. **Helper local** `formatarValorEtapa(etapa, valor)` para renderizar cada valor de acordo com `tipo_input` (cpf → mascarar, decimal → BRL, imagem → contagem de anexos, demais → texto cru ou "—").
6. **Título da página** (linhas 483-489): adicionar caso `revisando` → "Revisar antes de enviar".
7. **Botão voltar do header**: quando `revisando` for `true`, em vez de sair do fluxo, deve voltar para o formulário (`setRevisando(false)`).
8. **Reset**: ao concluir com sucesso (`setResultado(...)`) ou ao trocar de fluxo, garantir `setRevisando(false)`.

## Fora de escopo

- Nenhuma mudança em edge functions, schema, RLS ou no backend.
- Nenhuma alteração nos outros fluxos de chat/notificações.
- Sem novas dependências.
