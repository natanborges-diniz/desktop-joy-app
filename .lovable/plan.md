# Editar e apagar mensagens — Infoco Messenger

Hoje o chat interno (`/conversas/:otherId`) não tem nenhuma forma de editar ou apagar mensagens enviadas. Vamos adicionar as duas ações, com as decisões já confirmadas:

- **Apagar**: só o autor da mensagem, e apaga **para todos** (some também para o destinatário, em tempo real).
- **Editar**: só o autor, **sem limite de tempo**. A bolha mostra um rótulo discreto "editada".
- **Acesso**: botão `…` sempre visível ao lado da bolha (com menu suspenso "Editar" / "Apagar mensagem").
- **Anexos**: ao apagar uma mensagem com imagem/PDF, o arquivo correspondente é removido do bucket `mensagens-anexos`.

## Mudanças no banco (`mensagens_internas`)

Adicionar colunas para suportar edição e apagar lógico:

- `editada_em timestamptz null` — preenchido quando o autor edita o conteúdo.
- `apagada_em timestamptz null` — marca soft-delete; quando preenchida, a mensagem aparece como "Mensagem apagada" para ambos os lados (e some o anexo).

E as policies de RLS necessárias:

- **UPDATE** permitido apenas quando `auth.uid() = remetente_id`, restringindo as colunas alteráveis a `conteudo`, `editada_em` e `apagada_em` (validado por trigger que rejeita mudanças em `remetente_id`, `destinatario_id`, `created_at`, `conversa_id`).
- Manter as policies atuais de SELECT/INSERT como estão.

Realtime: a tabela já está publicada para `UPDATE` (o app já escuta `UPDATE` para o `lida`). Vamos reaproveitar esse mesmo canal para refletir edição e apagar nos dois lados.

## Mudanças no frontend

Arquivos afetados:
- `src/integrations/supabase/client.ts` — adicionar `editada_em` e `apagada_em` ao tipo `MensagemInterna`.
- `src/pages/ConversaDetail.tsx`:
  - SELECT inicial e listener de realtime passam a incluir os dois campos novos; o handler de `UPDATE` substitui a mensagem inteira (não só `lida`).
  - Para cada bolha *do autor* renderizar um botão `…` (ícone `MoreVertical` do lucide) que abre um `DropdownMenu` com **Editar** e **Apagar mensagem** (variante destrutiva). No mobile o botão fica sempre visível; no desktop usa `opacity-0 group-hover:opacity-100` para não poluir.
  - **Editar**: troca a bolha por um `Textarea` inline com botões "Salvar" / "Cancelar". Ao salvar, faz `UPDATE` setando `conteudo` novo e `editada_em = now()` (otimista). Mensagens só com anexo (sem texto) não mostram a opção Editar.
  - **Apagar**: abre `AlertDialog` de confirmação ("Apagar para todos? Essa ação não pode ser desfeita."). No confirmar:
    1. Se houver `anexo_url`, derivar o `path` dentro do bucket `mensagens-anexos` e chamar `supabase.storage.from(ANEXOS_BUCKET).remove([path])`.
    2. `UPDATE` setando `apagada_em = now()`, `conteudo = ''`, `anexo_url = null`, `anexo_tipo = null`.
  - Ao renderizar uma mensagem com `apagada_em`: mostrar bolha em itálico/cinza com texto "🚫 Mensagem apagada", sem anexo, sem ticks de leitura, sem menu `…`.
  - Quando `editada_em` estiver presente e a mensagem não estiver apagada, exibir "editada" em pequeno ao lado do horário.
- `src/components/ConversasSidebar.tsx`: o preview da última mensagem mostra "Mensagem apagada" quando a última for apagada (verifica `apagada_em`).

## Detalhes técnicos

- Soft-delete (em vez de `DELETE`) para que o realtime do tipo `UPDATE` propague a mudança para o destinatário sem precisar de listener de `DELETE` (que hoje não está configurado).
- Storage cleanup é *best-effort*: se o `remove` falhar, o `UPDATE` da mensagem continua. Erro só vira `toast` discreto, não bloqueia.
- Otimismo na UI: aplicar a mudança em `setMessages` antes da resposta do Supabase e reverter em caso de erro (mesmo padrão já usado no envio).
- Acessibilidade: botão `…` com `aria-label="Ações da mensagem"`; itens do menu com texto claro; diálogo de confirmação com foco no botão "Cancelar" por padrão.

## Fora de escopo

- Histórico de versões da mensagem editada.
- Apagar para si mesmo (esconder só do próprio lado).
- Edição/apagar de anexo isolado mantendo o texto.
