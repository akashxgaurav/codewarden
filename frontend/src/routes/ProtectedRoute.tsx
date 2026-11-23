import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/context/workspace-context";
import { Spinner } from "@/components/ui/Spinner";
import { Logo } from "@/components/ui/Logo";

function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <Logo />
        <Spinner className="size-5 text-brand" />
      </div>
    </div>
  );
}

/**
 * Guards the pages that need a session. A visitor without a session is sent
 * to the login page, and the page they wanted is remembered.
 */
export function ProtectedRoute({
  children,
  requireWorkspace = false,
}: {
  children: ReactNode;
  requireWorkspace?: boolean;
}) {
  const { user, loading } = useAuth();
  const { onboardingComplete, profile, loading: workspacesLoading } = useWorkspace();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // The profile decides whether the onboarding still has to be done. It is
  // null while it is being read, so the redirect waits for it.
  if (requireWorkspace && profile && !onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  if (requireWorkspace && workspacesLoading) {
    return <FullScreenLoader />;
  }

  return <>{children}</>;
}
