// Compartilhado com o app atrium-link: o conversa_id é o par ordenado
// dos dois user ids unidos por "_". Isso garante que A↔B sempre tenha
// o mesmo identificador, independentemente de quem mandou primeiro.
export function makeConversaId(a: string, b: string) {
  return [a, b].sort().join("_");
}
