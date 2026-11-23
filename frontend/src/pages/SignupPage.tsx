import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus } from "lucide-react";
import { AuthFooterLink, AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/context/auth-context";

const schema = z
  .object({
    displayName: z.string().min(2, "Tell us how we should call you."),
    email: z.email("Enter a valid email address."),
    password: z.string().min(6, "The password must have at least 6 characters."),
    confirmPassword: z.string().min(1, "Repeat the password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  });

type SignupValues = z.infer<typeof schema>;

export function SignupPage() {
  const { signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", email: "", password: "", confirmPassword: "" },
  });

  // A visitor that is already signed in is sent to the dashboard. While the
  // form is being submitted the redirect is held back: the session appears a
  // moment before the app moves to the onboarding, and redirecting in between
  // would skip it.
  if (!loading && user && !isSubmitting) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(values: SignupValues) {
    setFormError(null);

    try {
      await signUp({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
      });
      navigate("/onboarding");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "The account could not be created.",
      );
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start monitoring your repositories in a couple of minutes."
      footer={
        <>
          Already have an account? <AuthFooterLink to="/login">Sign in</AuthFooterLink>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <Input
          label="Full name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          error={errors.displayName?.message}
          {...register("displayName")}
        />

        <Input
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register("email")}
        />

        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          error={errors.password?.message}
          {...register("password")}
        />

        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat the password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <Button type="submit" className="w-full" loading={isSubmitting}>
          <UserPlus className="size-4" />
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
