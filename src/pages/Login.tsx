import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import infocoLogo from "@/assets/infoco-logo.png";

export default function Login() {
  const { session, signIn, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && session) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      toast.success("Bem-vindo de volta!");
      navigate("/", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha no login";
      toast.error(msg.includes("Invalid") ? "E-mail ou senha incorretos" : msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-header px-4 py-10">
      <div className="w-full max-w-md animate-fade-in">
        <header className="mb-8 text-center text-header-foreground">
          <img
            src={infocoLogo}
            alt="Infoco Optical Business"
            className="mx-auto mb-5 h-28 w-auto select-none drop-shadow-lg"
            draggable={false}
          />
          <p className="mt-1 text-sm text-white/75">Comunicação interna do Grupo Infoco</p>
        </header>

        <Card className="p-6 shadow-floating">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail corporativo</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="seu.nome@infocooptical.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-white/60">
          Use a mesma conta do portal Infoco Connect
        </p>
      </div>
    </main>
  );
}
