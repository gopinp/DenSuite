"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getKeycloak, initializeKeycloak } from "../lib/keycloak";

const apiBase = process.env.NEXT_PUBLIC_DENTSTAFF_API_URL ?? "http://localhost:8085";

export default function PracticeSetupNotice() {
  const [notice, setNotice] = useState<"loading" | "setup" | "error" | "hidden">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await initializeKeycloak();
        const keycloak = getKeycloak();
        if (!keycloak.hasRealmRole("EMPLOYER")) {
          if (active) setNotice("hidden");
          return;
        }
        await keycloak.updateToken(30);
        const response = await fetch(`${apiBase}/api/v1/accounts/practices`, {
          headers: { Authorization: `Bearer ${keycloak.token}` },
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message ?? "Your practice setup status could not be loaded.");
        }
        if (active) setNotice(result.practices?.length ? "hidden" : "setup");
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error
            ? error.message
            : "Your practice setup status could not be loaded.");
          setNotice("error");
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (notice === "loading" || notice === "hidden") return null;
  if (notice === "error") {
    return <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
      {message}
    </p>;
  }

  return (
    <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-5">
      <div>
        <h2 className="font-semibold text-violet-950">Set up your practice locations</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-violet-900">
          Add the practice name and address covered by your Den Suite license, then invite a manager.
          You can complete this after creating your owner account.
        </p>
      </div>
      <Link className="inline-flex min-h-10 items-center rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800"
        href="/hr/practices">
        Register practice
      </Link>
    </section>
  );
}
