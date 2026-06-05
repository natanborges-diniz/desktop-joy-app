Rename the visible label "Registrar resgate" to "Registrar venda" in `src/pages/LojaCashback.tsx`. No logic changes.

Edits:
- `TabsTrigger value="registrar"`: text → "Registrar venda".
- Success card heading "Resgate registrado!" → "Venda registrada!" (same context, avoids confusion).
- Error toast catch message "Falha ao registrar resgate." → "Falha ao registrar venda."

The `action: "registrar"` payload, state names, and all backend logic stay untouched.