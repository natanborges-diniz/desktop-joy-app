// COLE NO PROJETO "InFoco Messenger" em: src/components/NovaDemandaWizard.tsx
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type MenuOpcao = {
  id: string;
  parent_id: string | null;
  tipo: string; // 'submenu' | 'fluxo' | 'falar_equipe'
  fluxo: string;
  chave: string;
  titulo: string;
  emoji: string | null;
  ordem: number;
  setor_id: string | null;
};

type Setor = { id: string; nome: string };

type Props = { open: boolean; onOpenChange: (o: boolean) => void };

export function NovaDemandaWizard({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [opcoes, setOpcoes] = useState<MenuOpcao[]>([]);
  const [setores, setSetores] = useState<Record<string, string>>({});
  const [tipoUsuario, setTipoUsuario] = useState<string | null>(null);
  const [trilha, setTrilha] = useState<MenuOpcao[]>([]); // breadcrumb
  const [folhaSelecionada, setFolhaSelecionada] = useState<MenuOpcao | null>(null);
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: profileRow }, { data: opts }, { data: secs }] = await Promise.all([
        supabase.from("profiles").select("tipo_usuario").eq("id", user.id).single(),
        supabase
          .from("bot_menu_opcoes")
          .select("id,parent_id,tipo,fluxo,chave,titulo,emoji,ordem,setor_id")
          .eq("ativo", true)
          .order("ordem", { ascending: true }),
        supabase.from("setores").select("id,nome").eq("ativo", true),
      ]);
      if (!alive) return;
      setTipoUsuario((profileRow as any)?.tipo_usuario ?? null);
      // Filtra para o tipo_bot apropriado.
      // Lojas/colaboradores usam o catálogo "loja" (cobre as duas — colaboradores também abrem demandas via loja)
      const todas = (opts ?? []) as MenuOpcao[];
      const tipoBotAlvo = "loja";
      // Algumas opções vêm com fluxo prefixado por tipo_bot. Filtramos por uma coluna virtual via id-prefix
      // mas o melhor é reler a coluna tipo_bot:
      const { data: optsTipo } = await supabase
        .from("bot_menu_opcoes")
        .select("id")
        .eq("ativo", true)
        .eq("tipo_bot", tipoBotAlvo);
      const idsValidos = new Set((optsTipo ?? []).map((o: any) => o.id));
      setOpcoes(todas.filter((o) => idsValidos.has(o.id) && o.tipo !== "falar_equipe"));
      const map: Record<string, string> = {};
      for (const s of (secs ?? []) as Setor[]) map[s.id] = s.nome;
      setSetores(map);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, user]);

  function reset() {
    setTrilha([]); setFolhaSelecionada(null); setAssunto(""); setDescricao("");
  }

  useEffect(() => { if (!open) reset(); }, [open]);

  const nivelAtual = trilha[trilha.length - 1] ?? null;
  const filhos = useMemo(
    () => opcoes.filter((o) => o.parent_id === (nivelAtual?.id ?? null)).sort((a, b) => a.ordem - b.ordem),
    [opcoes, nivelAtual]
  );

  function entrar(o: MenuOpcao) {
    if (o.tipo === "submenu") {
      setTrilha((t) => [...t, o]);
    } else {
      setFolhaSelecionada(o);
    }
  }
  function voltar() {
    if (folhaSelecionada) { setFolhaSelecionada(null); return; }
    setTrilha((t) => t.slice(0, -1));
  }

  async function enviar() {
    if (!folhaSelecionada || !assunto.trim() || !descricao.trim()) {
      toast.error("Preencha assunto e descrição.");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("criar-demanda-interna", {
      body: {
        tipo_chave: folhaSelecionada.chave,
        assunto: assunto.trim(),
        descricao: descricao.trim(),
      },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Falha ao abrir demanda");
      return;
    }
    toast.success(`Demanda ${(data as any).protocolo} aberta!`);
    onOpenChange(false);
  }

  const podeAbrir = tipoUsuario === "loja" || tipoUsuario === "colaborador" || tipoUsuario === "admin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            {(trilha.length > 0 || folhaSelecionada) && (
              <button onClick={voltar} className="rounded-full p-1 hover:bg-muted" aria-label="Voltar">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <DialogTitle className="text-base">
              {folhaSelecionada
                ? `${folhaSelecionada.emoji ?? ""} ${folhaSelecionada.titulo}`
                : nivelAtual
                ? `${nivelAtual.emoji ?? ""} ${nivelAtual.titulo}`
                : "Nova demanda"}
            </DialogTitle>
          </div>
          {trilha.length > 0 && !folhaSelecionada && (
            <p className="mt-1 text-xs text-muted-foreground">
              {trilha.map((t) => t.titulo).join(" › ")}
            </p>
          )}
        </DialogHeader>

        <div className="max-h-[65vh] min-h-[280px] overflow-y-auto p-4">
          {!podeAbrir ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Apenas usuários do tipo <strong>loja</strong> ou <strong>colaborador</strong> podem abrir demandas.
            </p>
          ) : loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : folhaSelecionada ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                Encaminhada para o setor:{" "}
                <strong className="text-foreground">
                  {folhaSelecionada.setor_id ? setores[folhaSelecionada.setor_id] ?? "—" : "via tipo da demanda"}
                </strong>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Assunto</label>
                <Input
                  placeholder="Ex.: Cliente Maria — pedido 12345"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  rows={6}
                  placeholder="Detalhe a solicitação. Inclua nº de OS, CPF, valores etc."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={enviar} disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Abrir demanda
              </Button>
            </div>
          ) : filhos.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">Sem opções disponíveis.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filhos.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => entrar(o)}
                    className="flex w-full items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="text-xl">{o.emoji ?? "▶️"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{o.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.tipo === "submenu" ? "Categoria" : "Tipo de demanda"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
