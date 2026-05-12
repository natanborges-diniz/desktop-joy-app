import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TipoOrigem = "setor" | "loja" | "custom";

type Setor = { id: string; nome: string };
type Profile = {
  id: string;
  nome: string | null;
  email: string | null;
  cargo: string | null;
  setor_id: string | null;
  metadata?: { loja_nome?: string | null } | null;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function NovoGrupoDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tipo, setTipo] = useState<TipoOrigem>("setor");
  const [origemRef, setOrigemRef] = useState<string>("");
  const [nome, setNome] = useState("");
  const [setores, setSetores] = useState<Setor[]>([]);
  const [lojas, setLojas] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [extrasSearch, setExtrasSearch] = useState("");
  const [loadingFontes, setLoadingFontes] = useState(false);
  const [criando, setCriando] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setTipo("setor");
    setOrigemRef("");
    setNome("");
    setExtras(new Set());
    setExtrasSearch("");
  }, [open]);

  // Carrega setores, lojas, profiles e grupos existentes
  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    (async () => {
      setLoadingFontes(true);
      const [setRes, profRes, jaRes] = await Promise.all([
        (supabase as any)
          .from("setores")
          .select("id, nome")
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("profiles")
          .select("id, nome, email, cargo, setor_id, metadata")
          .eq("ativo", true)
          .order("nome"),
        (supabase as any)
          .from("conversas_grupo")
          .select("tipo_origem, origem_ref"),
      ]);
      if (!active) return;
      setSetores(((setRes.data as Setor[] | null) ?? []).filter((s) => s.nome));
      const profs = ((profRes.data as Profile[] | null) ?? []) as Profile[];
      setProfiles(profs);
      const lojaSet = new Set<string>();
      for (const p of profs) {
        const ln = p.metadata?.loja_nome;
        if (ln) lojaSet.add(ln);
      }
      setLojas([...lojaSet].sort());
      setExistentes(
        new Set(
          (((jaRes.data as Array<{ tipo_origem: string; origem_ref: string | null }>) ?? []) || [])
            .filter((g) => g.tipo_origem !== "custom" && g.origem_ref)
            .map((g) => `${g.tipo_origem}:${g.origem_ref}`),
        ),
      );
      setLoadingFontes(false);
    })();
    return () => {
      active = false;
    };
  }, [open, user]);

  // Membros derivados a partir de tipo + origemRef
  const derivados = useMemo<Profile[]>(() => {
    if (tipo === "custom") return [];
    if (!origemRef) return [];
    if (tipo === "setor") return profiles.filter((p) => p.setor_id === origemRef);
    return profiles.filter((p) => p.metadata?.loja_nome === origemRef);
  }, [tipo, origemRef, profiles]);

  const derivadosIds = useMemo(() => new Set(derivados.map((p) => p.id)), [derivados]);

  // Sugestão automática de nome quando muda origem
  useEffect(() => {
    if (tipo === "custom") return;
    if (!origemRef) return;
    const sugestao =
      tipo === "setor"
        ? `Setor — ${setores.find((s) => s.id === origemRef)?.nome ?? ""}`
        : `Loja — ${origemRef}`;
    setNome(sugestao);
  }, [tipo, origemRef, setores]);

  const opcoesOrigem = useMemo(() => {
    if (tipo === "setor") return setores.map((s) => ({ value: s.id, label: s.nome }));
    if (tipo === "loja") return lojas.map((l) => ({ value: l, label: l }));
    return [];
  }, [tipo, setores, lojas]);

  const jaExiste = tipo !== "custom" && origemRef ? existentes.has(`${tipo}:${origemRef}`) : false;

  // Lista de candidatos a "membros extras"
  const candidatosExtras = useMemo(() => {
    const q = extrasSearch.trim().toLowerCase();
    return profiles.filter((p) => {
      if (p.id === user?.id) return false;
      if (derivadosIds.has(p.id)) return false;
      if (!q) return true;
      return (
        (p.nome ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.cargo ?? "").toLowerCase().includes(q)
      );
    });
  }, [profiles, extrasSearch, derivadosIds, user]);

  function toggleExtra(id: string) {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCriar() {
    if (!user) return;
    const nomeFinal = nome.trim();
    if (!nomeFinal) {
      toast.error("Dê um nome ao grupo.");
      return;
    }
    if (tipo !== "custom" && !origemRef) {
      toast.error(tipo === "setor" ? "Escolha um setor." : "Escolha uma loja.");
      return;
    }
    if (jaExiste) {
      toast.error("Já existe um grupo para essa opção.");
      return;
    }

    let participantesIniciais: string[];
    if (tipo === "custom") {
      participantesIniciais = Array.from(new Set([user.id, ...extras]));
      if (participantesIniciais.length < 2) {
        toast.error("Selecione pelo menos um outro participante.");
        return;
      }
    } else {
      // Trigger preencherá com membros do setor/loja; mandamos só o criador
      participantesIniciais = [user.id];
    }

    setCriando(true);
    try {
      const insertPayload: Record<string, unknown> = {
        nome: nomeFinal,
        criado_por: user.id,
        participantes: participantesIniciais,
        tipo_origem: tipo,
      };
      if (tipo !== "custom") insertPayload.origem_ref = origemRef;

      const { data, error } = await (supabase as any)
        .from("conversas_grupo")
        .insert(insertPayload)
        .select("id, participantes")
        .single();
      if (error) throw error;
      const grupoId = data.id as string;

      // Mesclar extras quando origem é setor/loja
      if (tipo !== "custom" && extras.size > 0) {
        const atuais: string[] = (data.participantes as string[]) ?? [];
        const merged = Array.from(new Set([...atuais, user.id, ...extras]));
        const { error: upErr } = await (supabase as any)
          .from("conversas_grupo")
          .update({ participantes: merged })
          .eq("id", grupoId);
        if (upErr) {
          console.warn("[NovoGrupoDialog] não foi possível adicionar extras", upErr);
          toast.warning("Grupo criado, mas não foi possível adicionar todos os membros extras.");
        }
      }

      toast.success("Grupo criado!");
      onOpenChange(false);
      navigate(`/grupos/${grupoId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[NovoGrupoDialog] erro criando grupo", e);
      toast.error("Erro ao criar grupo: " + msg);
    } finally {
      setCriando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Novo grupo</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">
          {loadingFontes ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Origem</Label>
                <RadioGroup
                  value={tipo}
                  onValueChange={(v) => {
                    setTipo(v as TipoOrigem);
                    setOrigemRef("");
                    setNome("");
                  }}
                  className="mt-1.5 flex flex-wrap gap-3"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="setor" /> Setor
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="loja" /> Loja
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="custom" /> Manual
                  </label>
                </RadioGroup>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tipo === "custom"
                    ? "Escolha manualmente os participantes."
                    : "Membros sincronizam automaticamente com o setor/loja."}
                </p>
              </div>

              {tipo !== "custom" && (
                <div>
                  <Label className="text-xs">{tipo === "setor" ? "Setor" : "Loja"}</Label>
                  <Select value={origemRef} onValueChange={setOrigemRef}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue
                        placeholder={tipo === "setor" ? "Escolha um setor" : "Escolha uma loja"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {opcoesOrigem.map((o) => {
                        const dup = existentes.has(`${tipo}:${o.value}`);
                        return (
                          <SelectItem key={o.value} value={o.value} disabled={dup}>
                            {o.label} {dup ? "(grupo já existe)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="grupo-nome" className="text-xs">
                  Nome do grupo
                </Label>
                <Input
                  id="grupo-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder={
                    tipo === "custom"
                      ? "Ex: Time de marketing"
                      : "Nome sugerido automaticamente"
                  }
                  maxLength={80}
                  className="mt-1.5"
                />
              </div>

              {tipo !== "custom" && origemRef && (
                <div>
                  <Label className="text-xs">
                    Membros derivados ({derivados.length}) — automáticos
                  </Label>
                  <div className="mt-1.5 max-h-32 overflow-y-auto rounded border border-border bg-surface-muted">
                    {derivados.length === 0 ? (
                      <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                        Nenhum usuário ativo nessa origem.
                      </p>
                    ) : (
                      derivados.map((p) => (
                        <div key={p.id} className="px-3 py-1.5 text-sm">
                          {p.nome || p.email || "Usuário"}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs">
                  {tipo === "custom"
                    ? `Participantes (${extras.size} selecionado${extras.size === 1 ? "" : "s"})`
                    : `Adicionar membros extras (${extras.size})`}
                </Label>
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={extrasSearch}
                    onChange={(e) => setExtrasSearch(e.target.value)}
                    placeholder="Buscar pessoas"
                    className="pl-9"
                  />
                </div>
                <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border">
                  {candidatosExtras.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Nenhuma pessoa encontrada.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {candidatosExtras.map((p) => {
                        const checked = extras.has(p.id);
                        return (
                          <li key={p.id}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-muted",
                                checked && "bg-primary/5",
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleExtra(p.id)}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-foreground">
                                  {p.nome || p.email || "Usuário"}
                                </p>
                                {(p.cargo || p.email) && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {p.cargo || p.email}
                                  </p>
                                )}
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criando}>
            Cancelar
          </Button>
          <Button
            onClick={handleCriar}
            disabled={criando || jaExiste || (tipo !== "custom" && !origemRef)}
          >
            {criando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar grupo"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
