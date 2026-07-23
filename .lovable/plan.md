# Clarear "Demandas" e trazer comprovante para o card original

## Objetivo

Eliminar a confusão entre as duas áreas hoje chamadas **Demandas** e **Minhas** e garantir que o comprovante do payment-webhook apareça **dentro do card da solicitação original** (não como demanda separada).

## Mudanças de UI (Messenger)

### 1. Renomear itens do menu (`src/components/AppShell.tsx`)

| Antes | Depois | Rota | O que é |
|---|---|---|---|
| Demandas | **Notificações Externas** | `/demandas` | O que o setor/operador envia para a loja |
| Minhas | **Minhas Demandas** | `/minhas-demandas` | O que a loja abre para os setores |
| Minhas lojas | Minhas Lojas | `/demandas-lojas` | Visão supervisor (sem mudança) |

Ajustar também:
- Cabeçalho de cada página (`<h1>`) com o novo nome.
- Textos vazios ("Nenhuma demanda…") para refletir o novo nome.
- Rotas internas continuam iguais — só o rótulo muda.

### 2. Card de "Minhas Demandas" passa a exibir o comprovante

No `src/pages/LojaMinhasDemandas.tsx`, dentro do diálogo aberto da solicitação:

- Ler `metadata.comprovante_pagamento` (objeto: `url`, `mime`, `nome_arquivo`, `pago_em`, `valor_pago`, `forma`, `nsu`, `bandeira`) — quando o payment-webhook popular esse campo, renderizar uma **seção destacada "Pagamento recebido"** no topo do card, acima da thread de comentários:
  - Badge verde "✓ Pago"
  - Data/hora, valor, forma de pagamento
  - `AnexoCard` clicável com o comprovante (reaproveita o componente já existente para anexos de comentário)

- Também mostrar um badge "✓ Pago" na **lista** de "Minhas Demandas" quando `metadata.comprovante_pagamento` existir, para a loja identificar rapidamente sem abrir.

## Mudanças no Backend do Atrium (fora deste projeto — pedido para o time do Atrium)

Para o comprovante cair no card original, o payment-webhook precisa:

1. Localizar a `solicitacao` original via `numero_venda` + `cpf` (ou identificador equivalente que o gateway devolva).
2. Em vez de criar uma nova `demandas_loja`, fazer:
   - `UPDATE public.solicitacoes SET metadata = metadata || jsonb_build_object('comprovante_pagamento', {...}) WHERE id = <id>`
   - `INSERT INTO public.solicitacao_comentarios (solicitacao_id, tipo, autor_nome, conteudo, anexo_url, anexo_nome, anexo_mime) VALUES (…, 'retorno_setor', 'Pagamento', 'Comprovante recebido', <url>, …)` — para aparecer na thread também.
3. Só criar uma `demandas_loja` avulsa se **não achar** a solicitação original (fallback de auditoria).
4. Backfill: reprocessar as 3 demandas recentes (Super Shopping, União, Carapicuiba) migrando o comprovante para o card original.

Vou deixar isso documentado como próximo passo — não faz parte deste patch do Messenger.

## Fora de escopo (deste plano)

- Unificar as duas telas numa lista só (opção descartada).
- Alterar SLA, filtros ou o cron `auto-encerrar-demandas`.
- Mudar `demandas_loja` ou o wizard de nova demanda.

## Aceite

1. Menu inferior mostra **Notificações Externas** e **Minhas Demandas** com rótulos claros.
2. Quando o backend do Atrium começar a gravar `metadata.comprovante_pagamento` na `solicitacoes`, o card em Minhas Demandas mostra a seção "Pagamento recebido" com o anexo clicável e a lista ganha o badge "✓ Pago".
3. Nada quebra nas demandas antigas (o bloco só aparece se o metadata existir).
