import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2, QrCode, Eye, EyeOff, Shield } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import AppleIcon from "@/components/AppleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";
import { useAuth } from "@/lib/AuthContext";
import { hasPendingJoinCode, rememberJoinCode } from "@/lib/companyJoin";
import { ScanCompanyQrButton, ScanCompanyQrDialog } from "@/components/ScanCompanyQr";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const askedReturn = safeReturnTo();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  // Company QR scanned here: once signed in, /join adds the passenger to that
  // company with no code to type. Scanning never signs anyone in by itself.
  const [scanOpen, setScanOpen] = useState(false);
  const [joinReady, setJoinReady] = useState(() => hasPendingJoinCode());
  const returnTo = joinReady && askedReturn === "/" ? "/join" : askedReturn;
  const onScan = (code) => {
    if (!rememberJoinCode(code)) return;
    setJoinReady(true);
    if (isAuthenticated) navigate("/join");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", returnTo);
  };

  // Apple requires this alongside Google sign-in (App Store guideline 4.8).
  const handleApple = () => {
    base44.auth.loginWithProvider("apple", returnTo);
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Your journey starts here"
      subtitle="Sign in to track your bus and plan your pickup."
      footer={
        <div className="space-y-3 text-center">
          <div>
            New here?{" "}
            <Link
              to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
              className="text-primary font-medium hover:underline"
            >
              Create an account
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link to="/privacy" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
              <Shield className="h-3 w-3" aria-hidden="true" />
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground hover:underline">
              Terms of Service
            </Link>
          </div>
        </div>
      }
    >
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-12 h-12"
              required
            />
            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(v => !v)} className="absolute right-0 top-0 h-12 w-12 grid place-items-center text-muted-foreground rounded-lg focus-visible:ring-2 focus-visible:ring-primary">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
      <div className="mt-6">
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      <div className="mb-6 grid gap-3">
        <Button
          variant="outline"
          className="w-full h-12 text-sm font-medium"
          onClick={handleGoogle}
        >
          <GoogleIcon className="w-5 h-5 mr-2" />
          Continue with Google
        </Button>
        <Button
          variant="outline"
          className="w-full h-12 text-sm font-medium"
          onClick={handleApple}
        >
          <AppleIcon className="w-5 h-5 mr-2" />
          Continue with Apple
        </Button>
      </div>

      {joinReady ? (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-xl bg-secondary p-3 text-body-sm">
          <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span><span className="font-semibold">Company QR scanned.</span> Log in or create an account and you'll be added to your bus company automatically.</span>
        </div>
      ) : (
        <ScanCompanyQrButton className="mb-3 w-full h-12 text-sm font-medium" onClick={() => setScanOpen(true)} />
      )}
      <ScanCompanyQrDialog open={scanOpen} onOpenChange={setScanOpen} onCode={onScan} />
      </div>
    </AuthLayout>
  );
}