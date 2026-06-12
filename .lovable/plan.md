# Plano

## Objetivo
Confirmar se o erro no site publicado vem de uma publicação desatualizada, cache antigo do navegador, ou de o frontend publicado ainda apontar para um backend externo diferente do backend que você ajustou.

## O que vou verificar
1. Identificar qual backend o frontend atual usa para upload.
2. Comparar o comportamento do preview e do site publicado.
3. Conferir se o site publicado está servindo um bundle antigo.
4. Se necessário, ajustar o frontend para apontar para o backend correto ou orientar a republicação certa.

## Resultado esperado
Ter uma resposta objetiva para uma destas hipóteses:
- o site publicado está com versão antiga do frontend;
- o frontend está apontando para outro backend;
- o problema é cache do navegador/CDN;
- o backend correto não é o mesmo que recebeu a migration.

## Detalhes técnicos
- O código atual mostra que `src/integrations/supabase/client.ts` usa um backend externo.
- O upload em `ConversaDetail.tsx` envia para o bucket `mensagens-anexos` usando esse cliente.
- Na implementação, vou inspecionar as URLs efetivas do preview/publicado e conferir se a publicação disponível corresponde ao código que está no projeto agora.
- Se a causa for publicação desatualizada, a correção será no frontend/publicação, não na infra do bucket.

## Entrega
Ao final, te digo exatamente se “é a publicação” e qual ação resolve: republicar, trocar endpoint, limpar cache, ou corrigir o backend alvo.