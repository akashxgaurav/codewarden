import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LogIn } from "lucide-react";
import { AuthFooterLink, AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/context/auth-context";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(6, "The password must have at least 6 characters."),
});

type LoginValues = z.infer<typeof schema>;

export function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(values: LoginValues) {
    setFormError(null);

    try {
      await signIn(values);
      navigate("/dashboard");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Sign in failed. Please try again.",
      );
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your Codewarden workspace."
      footer={
        <>
          Don&apos;t have an account? <AuthFooterLink to="/signup">Create one</AuthFooterLink>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register("email")}
        />

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register("password")}
        />

        <Button type="submit" className="w-full" loading={isSubmitting}>
          <LogIn className="size-4" />
          Sign in
        </Button>

        <p className="text-center text-xs text-ink-faint">
          Sessions are managed by Firebase Authentication.
        </p>
      </form>

      <p className="mt-6 text-center text-xs text-ink-faint">
        <Link to="/signup" className="hover:text-ink">
          New here? Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
