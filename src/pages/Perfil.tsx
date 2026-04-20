import { useAuth } from "@/auth/auth-context";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, Mail, Briefcase } from "lucide-react";
import { toast } from "sonner";

export default function Perfil() {
  const { profile, user, signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    toast.success("Sessão encerrada");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Perfil</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        <div className="mx-auto max-w-md space-y-4">
          <Card className="flex flex-col items-center gap-3 p-6 text-center shadow-soft">
            <UserAvatar
              nome={profile?.nome}
              email={profile?.email ?? user?.email}
              url={profile?.avatar_url}
              size="lg"
            />
            <div>
              <p className="text-lg font-semibold text-foreground">
                {profile?.nome || user?.email || "Usuário"}
              </p>
              {profile?.cargo && <p className="text-sm text-muted-foreground">{profile.cargo}</p>}
            </div>
          </Card>

          <Card className="divide-y divide-border shadow-soft">
            <Row icon={<Mail className="h-4 w-4" />} label="E-mail" value={profile?.email ?? user?.email ?? "—"} />
            {profile?.cargo && (
              <Row icon={<Briefcase className="h-4 w-4" />} label="Cargo" value={profile.cargo} />
            )}
          </Card>

          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sair da conta
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            Infoco Messenger · v0.1
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}
