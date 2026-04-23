"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";
    if (!code) return;

    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!error) {
        router.push(next);
        router.refresh();
      }
    });
  }, [router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("Email ou senha incorretos");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Digite seu email primeiro");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const origin = window.location.origin;
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    setResetSent(true);
    setLoading(false);
  }

  return (
    <Card className="w-full max-w-sm border-border/50 bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center space-y-3 pb-2">
        <div className="mx-auto w-12 h-12 rounded-xl border border-border bg-black text-foreground font-bold text-lg flex items-center justify-center">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
            <path d="M34 12A16 16 0 0 0 10 20" stroke="#A78BFA" strokeWidth="5" strokeLinecap="round" fill="none" opacity="1"/>
            <path d="M10 20A16 16 0 0 0 10 28" stroke="#A78BFA" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.75"/>
            <path d="M10 28A16 16 0 0 0 24 40" stroke="#A78BFA" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"/>
            <path d="M24 40A16 16 0 0 0 34 36" stroke="#A78BFA" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.25"/>
            <circle cx="36" cy="24" r="3" fill="#F59E0B"/>
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold">Crivo Admin</h1>
          <p className="text-sm text-muted-foreground">
            Passou pelo Crivo.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="admin@crivo.app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          {resetSent && (
            <p className="text-sm text-green-500 text-center">
              Link enviado! Verifique seu email.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Esqueci minha senha
          </button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background px-4"><div className="w-8 h-8 rounded-full border-4 border-primary border-r-transparent animate-spin"></div></div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
