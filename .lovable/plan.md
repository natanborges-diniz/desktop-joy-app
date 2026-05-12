## Objetivo

Trazer o fluxo de criar grupo do projeto web (Lovable Connect & Flow) para este app desktop/extensão, já corrigindo dois problemas reportados:

1. O card de "formar grupo" fica grande demais e não rola dentro do viewport (no preview atual: 883×494).
2. Não há como adicionar membros manualmente — só dá pra derivar de Setor/Loja.

Também adicionar gestão de membros depois do grupo criado, dentro do `GrupoChat`.

## Escopo

- **Novo** `src/components/NovoGrupoDialog.tsx` — replicado do web, com layout corrigido e seleção manual de membros extras.
- **Editar** `src/components/ConversasSidebar.tsx` — botão "Novo grupo" no menu/header (hoje só tem "Nova conversa"); abre o `NovoGrupoDialog`.
- **Editar** `src/pages/GrupoChat.tsx` — no popover "Participantes" do header, adicionar bloco "Gerenciar participantes" (somente quem criou o grupo ou admin) com adicionar/remover.

V1 sem renomear grupo, sem apagar grupo, sem trocar avatar.

## UI — NovoGrupoDialog

Estrutura do `DialogContent` (corrige o overflow no preview baixinho):

```text
DialogContent  max-w-md  max-h-[85vh]  flex flex-col  p-0
├─ DialogHeader      (px-5 py-4 border-b, fixo)
├─ ScrollArea  flex-1 (corpo rolável)
│   ├─ Origem        Setor | Loja | Manual    (RadioGroup)
│   ├─ Select setor / Select loja             (oculto se Manual)
│   ├─ Nome do grupo                          (Input)
│   ├─ Membros derivados (preview, somente leitura, lista compacta)
│   └─ Adicionar membros extras
│       ├─ Input de busca
│       └─ Lista com Checkbox (profiles ativos, exclui já derivados e o próprio user)
└─ DialogFooter      (px-5 py-3 border-t, fixo)
    └─ Cancelar | Criar grupo
```

- `max-h-[85vh] flex flex-col` + `ScrollArea` no meio resolve o "card grande sem rolar".
- Para "Manual", `tipo_origem='custom'`, `origem_ref=null`, e `participantes` = `[criador, ...selecionados]`.
- Para "Setor"/"Loja", trigger no banco preenche `participantes`; os "extras" selecionados são mesclados em um `UPDATE` logo depois (`participantes = array(select distinct unnest(participantes || extras))`), feito client-side via segundo `update`.
- Validação: nome obrigatório, ≥1 outro participante, e bloqueio de duplicado para setor/loja (igual web).

## UI — Gerenciar participantes em GrupoChat

No `PopoverContent` "Participantes" do header (`src/pages/GrupoChat.tsx`):

- Cada linha ganha botão `×` para remover (visível só se `user.id === grupo.criado_por`).
- Embaixo da lista: botão "Adicionar participantes" abre um sub-dialog com busca + checkboxes de profiles ativos não membros; ao confirmar, faz `update conversas_grupo set participantes = participantes || novos`.
- Após qualquer mudança, refetch do `grupo` (já temos canal realtime em `conversas_grupo`).

## Sidebar — entrada do "Novo grupo"

Em `ConversasSidebar.tsx`, ao lado do botão atual que abre `NovaConversaDialog`, adicionar item "Novo grupo" (DropdownMenu com "Nova conversa" / "Novo grupo", ou segundo botão). Estado `novoGrupoOpen` separado.

## Detalhes técnicos

- Schema usado (já existente no banco compartilhado): `conversas_grupo(id, nome, criado_por, participantes uuid[], tipo_origem text, origem_ref text)`. Triggers do banco cuidam de derivação Setor/Loja; para `custom`, `participantes` é exatamente o array que enviarmos.
- Sem mudança de schema, sem migrations.
- Sem `RPC` novos. Tudo via `from("conversas_grupo")` + `from("profiles")`.
- Componentes `shadcn` já existentes: `Dialog`, `ScrollArea`, `RadioGroup`, `Select`, `Checkbox`, `Input`, `Button`, `Popover`, `DropdownMenu`.
- Sem alteração em `App.tsx` (rota `/grupos/:groupId` já existe).

## Fora de escopo (V1)

- Renomear/apagar grupo.
- Permissões finas além de "criador edita membros". Admin global continua valendo via RLS do banco.
- Avatar/imagem do grupo.
