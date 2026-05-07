# Restaurar envio de mensagens — rodar migração no Supabase externo

## O que está quebrando

`ConversaDetail.tsx` faz `select ... editada_em, apagada_em` em `mensagens_internas`, mas essas colunas não existem no banco do projeto Supabase externo (`kvggebtnqmxydtwaumqz`). Toda chamada volta `400` e o chat não carrega nem envia mensagem.

Como esse banco **não** é o Lovable Cloud deste projeto, eu não consigo aplicar a migração daqui — ela precisa ser executada manualmente no SQL Editor do projeto `kvggebtnqmxydtwaumqz`.

## Ação para você executar (uma vez)

Abra o SQL Editor do Supabase do atrium-link e rode:

```sql
-- 1) Colunas que faltaram
ALTER TABLE public.mensagens_internas
  ADD COLUMN IF NOT EXISTS editada_em timestamptz,
  ADD COLUMN IF NOT EXISTS apagada_em timestamptz;

-- 2) Trigger que protege campos imutáveis em UPDATE
CREATE OR REPLACE FUNCTION public.mensagens_internas_protect_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.remetente_id IS DISTINCT FROM OLD.remetente_id
     OR NEW.destinatario_id IS DISTINCT FROM OLD.destinatario_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.conversa_id IS DISTINCT FROM OLD.conversa_id
  THEN RAISE EXCEPTION 'Campos imutáveis não podem ser alterados';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mensagens_internas_protect ON public.mensagens_internas;
CREATE TRIGGER trg_mensagens_internas_protect
BEFORE UPDATE ON public.mensagens_internas
FOR EACH ROW EXECUTE FUNCTION public.mensagens_internas_protect_immutable();

-- 3) RLS: autor pode atualizar a própria mensagem (editar/apagar)
DROP POLICY IF EXISTS "Sender can update own message" ON public.mensagens_internas;
CREATE POLICY "Sender can update own message"
ON public.mensagens_internas
FOR UPDATE TO authenticated
USING (auth.uid() = remetente_id);
```

## Hardening no frontend (o que eu vou fazer ao implementar este plano)

Para que um problema parecido não derrube o chat de novo:

- `src/pages/ConversaDetail.tsx`: tornar `editada_em`/`apagada_em` opcionais no consumo — se o `select` falhar com `42703`, faz fallback para o `select` antigo (sem essas colunas) e desabilita os botões "Editar"/"Apagar" com um aviso silencioso. Assim, mesmo sem a migração, o chat envia/recebe normalmente.
- `src/components/ConversasSidebar.tsx`: aplicar o mesmo fallback no preview da última mensagem (ignora `apagada_em` quando indefinido).

Sem alterações de UX visível enquanto a migração não roda; depois que você rodar a SQL acima, editar/apagar volta a funcionar automaticamente.

## Fora de escopo

- Reverter as features de editar/apagar.
- Migrar este projeto para o Lovable Cloud.
