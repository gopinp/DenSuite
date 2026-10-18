"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getKeycloak, initializeKeycloak } from "../../lib/keycloak";

type PracticeGroup = {
  id: string;
  name: string;
  practiceSetup: "SINGLE" | "MULTIPLE";
  employerUsername: string;
  employerEmail: string;
  practiceCount: number;
  accountCount: number;
  profileCreatedAt: string;
  status: "PROFILE_CREATED";
};

const apiBase = process.env.NEXT_PUBLIC_DENTSTAFF_API_URL ?? "http://localhost:8085";

export default function AdminDashboard() {
  const [practiceGroups, setPracticeGroups] = useState<PracticeGroup[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [updatingLicense, setUpdatingLicense] = useState("");

  const loadPracticeGroups = useCallback(async () => {
    const keycloak = getKeycloak();
    await keycloak.updateToken(30);
    const response = await fetch(`${apiBase}/api/v1/admin/practices`, {
      headers: { Authorization: `Bearer ${keycloak.token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message ?? "Onboarded practices could not be loaded.");
    }
    setPracticeGroups(result as PracticeGroup[]);
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        await initializeKeycloak();
        if (!getKeycloak().hasRealmRole("DENTSUITE_ADMIN")) {
          setIsAdmin(false);
          return;
        }
        setIsAdmin(true);
        await loadPracticeGroups();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Onboarded practices could not be loaded. Try again or contact support.",
        );
      } finally {
        setLoading(false);
      }
    }
    void initialize();
  }, [loadPracticeGroups]);

  async function updateLicense(group: PracticeGroup) {
    const practiceSetup = group.practiceSetup === "SINGLE" ? "MULTIPLE" : "SINGLE";
    if (practiceSetup === "SINGLE" && group.practiceCount > 1) {
      setMessage("A group with multiple locations cannot be changed to a single-practice license.");
      return;
    }
    setUpdatingLicense(group.id);
    setMessage("");
    try {
      const keycloak = getKeycloak();
      await keycloak.updateToken(30);
      const response = await fetch(`${apiBase}/api/v1/admin/practices/${group.id}/license`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ practiceSetup }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? "The practice license could not be updated.");
      }
      await loadPracticeGroups();
      setMessage(`${group.name} now has a ${practiceSetup === "SINGLE" ? "single" : "multiple"}-practice license.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The practice license could not be updated.");
    } finally {
      setUpdatingLicense("");
    }
  }

  return (
    <main className="space-y-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-700">
            PLATFORM ADMIN
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Practice onboarding</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Review practices whose employers have completed registration, see how many locations
            and accounts are linked, or invite another practice to Den Suite.
          </p>
        </section>

        {loading ? (
          <p className="text-sm text-slate-500" role="status">Loading onboarded practices…</p>
        ) : !isAdmin ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            This page is available only to Den Suite administrators. Sign in with an account
            assigned the <code>DENTSUITE_ADMIN</code> role.
          </p>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-3" aria-label="Onboarding summary">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Onboarded practice groups</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{practiceGroups.length}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">Linked practice locations</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">
                  {practiceGroups.reduce((total, group) => total + group.practiceCount, 0)}
                </p>
              </article>
              <article className="flex flex-col justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-5">
                <div>
                  <p className="text-sm font-semibold text-violet-950">Onboard a practice</p>
                  <p className="mt-1 text-sm text-violet-900">
                    Email a secure, one-use employer registration code.
                  </p>
                </div>
                <Link
                  className="inline-flex min-h-10 w-fit items-center rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800"
                  href="/admin/employers"
                >
                  Create employer invitation
                </Link>
              </article>
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Registered practices</h2>
                <p className="mt-1 text-sm text-slate-600">
                  A profile is created when an invited employer completes registration.
                </p>
              </div>
              {message && (
                <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900" role="alert">
                  {message}
                </p>
              )}
              {practiceGroups.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                  <h3 className="font-semibold text-slate-900">No practices onboarded yet</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Employer invitations appear here after registration is completed.
                  </p>
                  <Link
                    className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800"
                    href="/admin/employers"
                  >
                    Start onboarding
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Practice or group</th>
                        <th className="px-5 py-3">Employer profile</th>
                        <th className="px-5 py-3">Profile status</th>
                        <th className="px-5 py-3">Linked practices</th>
                        <th className="px-5 py-3">Accounts</th>
                        <th className="px-5 py-3">Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {practiceGroups.map((group) => (
                        <tr key={group.id}>
                          <td className="px-5 py-4">
                            <strong className="block text-slate-900">{group.name}</strong>
                            <span className="block text-xs text-slate-500">
                              {group.practiceSetup === "SINGLE" ? "Single practice" : "Multiple practices"}
                            </span>
                            <button
                              className="mt-2 text-xs font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-50"
                              disabled={updatingLicense === group.id}
                              onClick={() => void updateLicense(group)}
                              type="button"
                            >
                              {updatingLicense === group.id
                                ? "Updating…"
                                : group.practiceSetup === "SINGLE"
                                  ? "Approve multiple practices"
                                  : "Change to single license"}
                            </button>
                          </td>
                          <td className="px-5 py-4">
                            <span className="block text-slate-800">{group.employerUsername}</span>
                            <span className="text-xs text-slate-500">{group.employerEmail}</span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                              Profile created
                            </span>
                          </td>
                          <td className="px-5 py-4 font-medium text-slate-800">{group.practiceCount}</td>
                          <td className="px-5 py-4 text-slate-700">{group.accountCount}</td>
                          <td className="px-5 py-4 text-slate-600">
                            {new Date(group.profileCreatedAt).toLocaleDateString("en-GB")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
