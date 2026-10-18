"use client";

import { useState } from "react";
import { getKeycloak, initializeKeycloak } from "../lib/keycloak";

export default function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setIsSigningOut(true);
    setError("");
    try {
      await initializeKeycloak();
      await getKeycloak().logout({ redirectUri: `${window.location.origin}/` });
    } catch (reason) {
      console.error("Den Suite could not sign out of Keycloak.", reason);
      setError("Sign out failed. Please try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <>
      <button
        className="sign-out-button"
        disabled={isSigningOut}
        onClick={signOut}
        type="button"
      >
        {isSigningOut ? "Signing out…" : "Sign out"}
      </button>
      {error && <span className="sign-out-error" role="alert">{error}</span>}
    </>
  );
}
