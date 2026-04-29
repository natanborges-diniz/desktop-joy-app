# Verificação e atualização da marcação de leitura no DemandaChat

## Verificação
Conferi `src/pages/DemandaChat.tsx` linhas 75–85: a implementação atual **só** atualiza `demandas_loja` (campos `visto_pela_loja_at` / `visto_por_loja_user_id`). O segundo update — em `demanda_mensagens` — que é o que o `DemandaThreadView.tsx` do Atrium lê para renderizar o `CheckCheck` (✓✓) **ainda não foi aplicado**. A dependência `msgs.length` também está faltando.

## Mudança a aplicar

Substituir o bloco das linhas 75–85 em `src/pages/DemandaChat.tsx` por:

1. Calcular `nowIso` uma vez.
2. Update em `demandas_loja` (mantém compatibilidade da UI da loja).
3. Update em `demanda_mensagens` filtrado por:
   - `demanda_id = id`
   - `direcao = 'operador_para_loja'`
   - `visto_pela_loja_at IS NULL`
   
   setando `visto_pela_loja_at = nowIso` e `visto_por_loja_user_id = user.id`.
4. Trocar deps do `useEffect` para `[id, user?.id, msgs.length]` para re-rodar quando chegar uma mensagem nova do operador enquanto o chat estiver aberto.

Nenhum outro trecho do arquivo é alterado. Não há mudanças de schema, RLS ou outras telas.

## Resultado esperado
Ao abrir uma demanda (e a cada nova mensagem recebida do operador com o chat aberto), todas as mensagens `operador_para_loja` ainda não vistas passam a ter `visto_pela_loja_at` preenchido — fazendo o ✓✓ aparecer no painel do operador no Atrium.
