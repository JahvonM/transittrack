import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import JourneyLoading from "@/components/JourneyLoading";
import AccessRecovery from "@/components/system/AccessRecovery";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
import Logo from "@/components/Logo";
import LiveClock from "@/components/LiveClock";
import WeatherWidget from "@/components/WeatherWidget";
import WelcomeHero from "@/components/welcome/WelcomeHero";
import HowItWorks from "@/components/welcome/HowItWorks";
import WelcomeFooter from "@/components/welcome/WelcomeFooter";
import { Button } from "@/components/ui/button";
import { homeFor } from "@/lib/roleHome";
import { ChevronRight } from "lucide-react";

// The public front door: sign in, book a taxi, track a ride, and the legal
// pages the app stores require. It uses the app's own colour tokens, so light
// mode and the chosen colour theme apply here as everywhere else.
export default function Welcome() {
  const { user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, checkAppState } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (isAuthenticated && user) navigate(homeFor(user), { replace: true });
  }, [isAuthenticated, user, navigate]);
  if (isLoadingAuth || isLoadingPublicSettings || (isAuthenticated && user)) return <JourneyLoading onRetry={checkAppState} />;
  if (authError?.type === "user_not_registered") return <UserNotRegisteredError />;
  if (authError && authError.type !== "auth_required") return <AccessRecovery onRetry={checkAppState} />;
  return <div className="tt-welcome min-h-[100dvh] flex flex-col">
    <header className="tt-welcome-header">
      <Link to="/" className="flex items-center gap-2 font-bold text-xl"><Logo /><span>McSween <span className="text-primary">Transport</span></span></Link>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-4"><WeatherWidget variant="chip" /><LiveClock className="text-xs text-muted-foreground" /></div>
        <Button asChild variant="outline" className="rounded-xl sm:hidden"><Link to="/login">Sign in <ChevronRight className="w-4 h-4" /></Link></Button>
      </div>
    </header>
    <main className="tt-welcome-main flex-1">
      <WelcomeHero />
      <HowItWorks />
    </main>
    <WelcomeFooter />
  </div>;
}