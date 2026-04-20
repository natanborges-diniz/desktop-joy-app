import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { Loader2, Search } from "lucide-react";

type Setor = { id: string; nome: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NovaConversaDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [setores, setSetores] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    let active = true;

    async function load() {
      setLoading(true);
      const [{ data: profs }, { data: secs }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,nome,email,cargo,setor_id,avatar_url,ativo")
          .neq("id", user!.id)
          .eq("ativo", true)
          .order("nome", { ascending: true })
          .limit(500),
        supabase.from("setores").select("id,nome"),
      ]);
      if (!active) return;
      setProfiles((profs ?? []) as Profile[]);
      const map: Record<string, string> = {};
      for (const s of (secs ?? []) as Setor[]) if (s.nome) map[s.id] = s.nome;
      setSetores(map);
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [open, user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const setorNome = p.setor_id ? setores[p.setor_id] ?? "" : "";
      return (
        (p.nome ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.cargo ?? "").toLowerCase().includes(q) ||
        setorNome.toLowerCase().includes(q)
      );
    });
  }, [profiles, search, setores]);

  function selecionar(id: string) {
    onOpenChange(false);
    setSearch("");
    navigate(`/conversas/${id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Nova conversa</DialogTitle>
        </DialogHeader>
        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, cargo ou setor"
              className="pl-9"
            />
          </div>
        </div>

        <div className="max-h-[60vh] min-h-[280px] overflow-y-auto scroll-thin">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {search ? "Nenhum colega encontrado." : "Nenhum usuário disponível."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((p) => {
                const setorNome = p.setor_id ? setores[p.setor_id] : null;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => selecionar(p.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
                    >
                      <UserAvatar nome={p.nome} email={p.email} url={p.avatar_url} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          {p.nome || p.email || "Usuário"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[p.cargo, setorNome].filter(Boolean).join(" • ") || p.email}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
