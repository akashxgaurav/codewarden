import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthProvider";
import { WorkspaceProvider } from "@/context/WorkspaceProvider";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { Spinner } from "@/components/ui/Spinner";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

// The pages are loaded on demand so the first paint only ships what is needed
// to show the screen the visitor asked for.
const DashboardPageLazy = lazy(() =>
  import("@/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const ActivityPageLazy = lazy(() =>
  import("@/pages/ActivityPage").then((module) => ({ default: module.ActivityPage })),
);
const IncidentsPageLazy = lazy(() =>
  import("@/pages/IncidentsPage").then((module) => ({ default: module.IncidentsPage })),
);
const NewErrorPageLazy = lazy(() =>
  import("@/pages/NewErrorPage").then((module) => ({ default: module.NewErrorPage })),
);
const SettingsPageLazy = lazy(() =>
  import("@/pages/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);

function PageFallback() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <Spinner className="size-6 text-brand" />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute requireWorkspace>
                    <DashboardPageLazy />
                  </ProtectedRoute>
                }
              />

              <Route path="/activity" element={<ActivityPageLazy />} />

              <Route
                path="/incidents"
                element={
                  <ProtectedRoute requireWorkspace>
                    <IncidentsPageLazy />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/incidents/new"
                element={
                  <ProtectedRoute requireWorkspace>
                    <NewErrorPageLazy />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPageLazy />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
