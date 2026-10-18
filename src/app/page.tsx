"use client";

import { useEffect, useState, type FormEvent } from "react";
import BrandMark from "../components/BrandMark";
import { getKeycloak, initializeKeycloak } from "../lib/keycloak";

type AuthScreen = "login" | "register-choice" | "employer-register" | "employee-register" | "forgot";

export default function HomePage() {
  const [screen, setScreen] = useState<AuthScreen>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = screen === "employer-register" || screen === "employee-register";
  const isEmployer = screen === "employer-register";
  const isForgot = screen === "forgot";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("register") === "1") {
      setScreen("register-choice");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (isRegister && password !== confirmPassword) {
      setMessage("Your passwords don't match. Check them and try again.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!isRegister) {
        await initializeKeycloak();
        await getKeycloak().login({
          loginHint: username.trim(),
          redirectUri: `${window.location.origin}/workspace`,
        });
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_DENTSTAFF_API_URL ?? "http://localhost:8085"}/api/v1/accounts/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            password,
            joinCode,
            accountType: isEmployer ? "EMPLOYER" : "EMPLOYEE",
            email,
          }),
        },
      );
      const result: { message?: string } = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? "Account registration failed.");
      }

      await initializeKeycloak();
      await getKeycloak().login({
        loginHint: username.trim(),
        redirectUri: `${window.location.origin}/workspace`,
      });
      return;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Den Suite could not complete your request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchScreen(nextScreen: AuthScreen) {
    setMessage("");
    setScreen(nextScreen);
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <header className="auth-header">
          <a href="/" className="auth-brand" aria-label="Den Suite">
            <BrandMark />
            <span>Den <span className="auth-brand-light">Suite</span></span>
          </a>
          <span className="auth-header-label">PRACTICE PORTAL</span>
        </header>

        <section className="auth-content" aria-labelledby="auth-title">
          <div className="auth-intro">
            <p className="auth-eyebrow"><span /> Your Dental Practice Hub</p>
            <h1 id="auth-title">
              {screen === "register-choice"
                ? "Join Den Suite"
                : isEmployer
                  ? "Create owner account"
                  : screen === "employee-register"
                    ? "Join your practice"
                    : isForgot
                      ? "Reset your password"
                      : "Welcome back"}
            </h1>
            <p>
              {screen === "register-choice"
                ? "Choose the option that best describes you."
                : isEmployer
                  ? "Create your owner account with a code from Den Suite Admin. You can add your practice after signing in."
                  : screen === "employee-register"
                    ? "Create your employee account with a code from your practice manager."
                    : isForgot
                      ? "Continue to the secure sign-in page to reset your password."
                      : "Continue to Den Suite secure sign-in to enter your username and password."}
            </p>
          </div>

          <form className="auth-card" onSubmit={submit}>
            {screen === "register-choice" ? (
              <div className="auth-register-options">
                <button
                  className="auth-register-option"
                  onClick={() => switchScreen("employer-register")}
                  type="button"
                >
                  <span className="auth-option-icon" aria-hidden="true">✦</span>
                  <span className="auth-option-copy">
                    <strong>I'm an employer</strong>
                    <small>Register your practice or practice group with a Den Suite Admin code.</small>
                  </span>
                  <span className="auth-option-arrow" aria-hidden="true">›</span>
                </button>
                <button
                  className="auth-register-option"
                  onClick={() => switchScreen("employee-register")}
                  type="button"
                >
                  <span className="auth-option-icon employee" aria-hidden="true">＋</span>
                  <span className="auth-option-copy">
                    <strong>I'm an employee</strong>
                    <small>Join an existing practice with an invite code from your practice manager.</small>
                  </span>
                  <span className="auth-option-arrow" aria-hidden="true">›</span>
                </button>
                <div className="auth-switch auth-choice-switch">
                  <span>Already have an account?</span>
                  <button className="auth-text-button" onClick={() => switchScreen("login")} type="button">
                    Sign in
                  </button>
                </div>
              </div>
            ) : isRegister && (
              <div className="auth-card-heading">
                <h2>{isEmployer ? "Owner account" : "Employee details"}</h2>
                <span>{isEmployer ? "OWNER ACCOUNT" : "EMPLOYEE ACCOUNT"}</span>
              </div>
            )}

            {screen !== "register-choice" && <div className="auth-field">
              <label htmlFor="username">Username</label>
              <input
                autoComplete="username"
                autoCapitalize="none"
                id="username"
                name="username"
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter your username"
                required
                value={username}
              />
            </div>}

            {isRegister && (
              <div className="auth-field">
                <label htmlFor="email">Email address</label>
                <input
                  autoComplete="email"
                  autoCapitalize="none"
                  id="email"
                  maxLength={254}
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
                <small>Used for account verification and password recovery.</small>
              </div>
            )}

            {isRegister && (
              <div className="auth-field">
                <label htmlFor="password">Password</label>
                <input
                  autoComplete="new-password"
                  id="password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={12}
                  placeholder="Create a password (12 characters minimum)"
                  required
                  type="password"
                  value={password}
                />
              </div>
            )}

            {isRegister && (
              <>
                <div className="auth-field">
                  <label htmlFor="confirm-password">Confirm password</label>
                  <input
                    autoComplete="new-password"
                    id="confirm-password"
                    name="confirm-password"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Enter your password again"
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="join-code">
                    {isEmployer ? "Den Suite Admin join code" : "Practice join code"}
                  </label>
                  <input
                    autoCapitalize="characters"
                    autoComplete="off"
                    id="join-code"
                    name="join-code"
                    onChange={(event) => setJoinCode(event.target.value)}
                    placeholder={
                      isEmployer
                        ? "Enter the code from Den Suite Admin"
                        : "Enter the code from your practice manager"
                    }
                    required
                    value={joinCode}
                  />
                  <small>
                    {isEmployer
                      ? "Get your practice setup code from your Den Suite administrator."
                      : "Ask your practice manager for an employee invite code."}
                  </small>
                </div>

              </>
            )}

            {screen === "login" && (
              <button
                className="auth-text-button auth-forgot"
                onClick={() => switchScreen("forgot")}
                type="button"
              >
                Forgot password?
              </button>
            )}

            {message && <p className="auth-message" role="status">{message}</p>}

            {screen !== "register-choice" && <>
              <button className="auth-submit" disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? "Please wait..."
                  : isEmployer
                    ? "Create owner account"
                    : screen === "employee-register"
                      ? "Create employee account"
                      : isForgot
                        ? "Continue to secure sign-in"
                        : "Continue to sign in"}
                <span aria-hidden="true">›</span>
              </button>

              <div className="auth-switch">
                <span>
                  {isRegister
                    ? "Already have an account?"
                    : isForgot
                      ? "Remember your password?"
                      : "New to Den Suite?"}
                </span>
                <button
                  className="auth-text-button"
                  onClick={() => switchScreen(isRegister || isForgot ? "login" : "register-choice")}
                  type="button"
                >
                  {isRegister || isForgot ? "Sign in" : "Register"}
                </button>
              </div>
            </>}
          </form>
        </section>

        <footer className="auth-footer">
          <span aria-hidden="true">✦</span>
          Made for the people behind every healthy smile.
        </footer>
      </div>
    </main>
  );
}
