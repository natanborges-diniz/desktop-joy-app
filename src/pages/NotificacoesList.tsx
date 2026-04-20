import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Notif = {
  id: string;
  titulo: string | null;
  mensagem: string | null;
  lida: boolean | null;
  created_at: string;
};

export default function NotificacoesList() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("notificacoes")
      .select("id,titulo,mensagem,lida,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setItems((data ?? []) as Notif[]);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Avisos</h1>
        </div>
        <p className="pb-3 text-sm text-white/80">Notificações e atualizações</p>
      </header>
      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-2 text-center">
            <Bell className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sem avisos por aqui.</p>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-2xl gap-2">
            {items.map((n) => (
              <li key={n.id}>
                <Card className="flex items-start gap-3 p-4 shadow-soft">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{n.titulo ?? "Aviso"}</p>
                    {n.mensagem && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.mensagem}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { locale: ptBR, addSuffix: true })}
                    </p>
                  </div>
                  {!n.lida && <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
