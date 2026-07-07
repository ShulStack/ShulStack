"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Button, Card, Field } from "@shulstack/ui";
import { useState } from "react";

import { errorMessage } from "../lib/format";

type AuthFlow = "signIn" | "signUp";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<AuthFlow>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card title={flow === "signIn" ? "Sign in" : "Create your account"}>
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setPending(true);
          const formData = new FormData(event.currentTarget);
          formData.set("flow", flow);
          signIn("password", formData)
            .catch((caught) => setError(errorMessage(caught)))
            .finally(() => setPending(false));
        }}
      >
        <Field label="Email">
          {(id) => <input autoComplete="email" id={id} name="email" required type="email" />}
        </Field>
        <Field label="Password" hint={flow === "signUp" ? "At least 8 characters." : undefined}>
          {(id) => (
            <input
              autoComplete={flow === "signIn" ? "current-password" : "new-password"}
              id={id}
              minLength={8}
              name="password"
              required
              type="password"
            />
          )}
        </Field>
        {error === null ? null : <p className="form-error">{error}</p>}
        <div className="auth-actions">
          <Button disabled={pending} type="submit">
            {flow === "signIn" ? "Sign in" : "Create account"}
          </Button>
          <Button
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
            variant="secondary"
          >
            {flow === "signIn" ? "New here? Sign up" : "Use an existing account"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
