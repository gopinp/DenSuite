"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
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

type PracticeCode = {
  id: string;
  kind: "EMPLOYER_INVITATION" | "MANAGER_CODE" | "EMPLOYEE_CODE";
  practiceName: string | null;
  recipientEmail: string | null;
  issuedBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  redeemedBy: string | null;
  revokedAt: string | null;
  status: "ACTIVE" | "USED" | "EXPIRED" | "REVOKED";
  code: string | null;
  canReset: boolean;
  canResend: boolean;
};

type PracticeLocation = { id: string; name: string; accountCount: number };

type ResetResult = { code: string; expiresAt: string; recipientEmail: string | null; emailed: boolean };

const codeKindLabels: Record<PracticeCode["kind"], string> = {
  EMPLOYER_INVITATION: "Employer invitation",
  MANAGER_CODE: "Manager code",
  EMPLOYEE_CODE: "Employee code",
};

const apiBase = process.env.NEXT_PUBLIC_DENTSTAFF_API_URL ?? "http://localhost:8085";

async function adminFetch(path: string, init: RequestInit = {}) {
  const keycloak = getKeycloak();
  await keycloak.updateToken(30);
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${keycloak.token}`,
    },
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(result?.message ?? "The request could not be completed.");
  }
  return result;
}

export default function AdminDashboard() {
  const [practiceGroups, setPracticeGroups] = useState<PracticeGroup[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [updatingLicense, setUpdatingLicense] = useState("");
  const [managedId, setManagedId] = useState("");
  const [editId, setEditId] = useState("");
  const [editSetup, setEditSetup] = useState<"SINGLE" | "MULTIPLE">("SINGLE");
  const [locations, setLocations] = useState<PracticeLocation[]>([]);
  const [keepId, setKeepId] = useState("");
  const [codes, setCodes] = useState<PracticeCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [resettingId, setResettingId] = useState("");
  const [resetResult, setResetResult] = useState<(ResetResult & { forId: string }) | null>(null);

  async function toggleManage(group: PracticeGroup) {
    setResetResult(null);
    if (managedId === group.id) {
      setManagedId("");
      return;
    }
    setManagedId(group.id);
    setCodes([]);
    setCodesLoading(true);
    setMessage("");
    try {
      setCodes((await adminFetch(`/api/v1/admin/practices/${group.id}/codes`)) as PracticeCode[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shared codes could not be loaded.");
    } finally {
      setCodesLoading(false);
    }
  }

  async function resendCode(group: PracticeGroup, code: PracticeCode) {
    setResettingId(code.id);
    setMessage("");
    try {
      const result = (await adminFetch(
        `/api/v1/admin/practices/${group.id}/codes/${code.id}/resend`,
        { method: "POST" },
      )) as { recipientEmail: string };
      setMessage(`Code emailed to ${result.recipientEmail}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The code could not be resent.");
    } finally {
      setResettingId("");
    }
  }

  async function resetCode(group: PracticeGroup, code: PracticeCode) {
    if (!window.confirm("Reset this code? Any unused old code stops working, and a new code is issued and emailed to the recipient.")) return;
    setResettingId(code.id);
    setMessage("");
    try {
      const result = (await adminFetch(
        `/api/v1/admin/practices/${group.id}/codes/${code.id}/reset`,
        { method: "POST" },
      )) as ResetResult;
      setResetResult({ ...result, forId: group.id });
      setCodes((await adminFetch(`/api/v1/admin/practices/${group.id}/codes`)) as PracticeCode[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The code could not be reset.");
    } finally {
      setResettingId("");
    }
  }

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

  async function openEdit(group: PracticeGroup) {
    if (editId === group.id) {
      setEditId("");
      return;
    }
    setEditId(group.id);
    setEditSetup(group.practiceSetup);
    setKeepId("");
    setLocations([]);
    setMessage("");
    try {
      const result = (await adminFetch(`/api/v1/admin/practices/${group.id}/practices`)) as PracticeLocation[];
      setLocations(result);
      setKeepId(result[0]?.id ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Practice locations could not be loaded.");
    }
  }

  async function saveLicense(group: PracticeGroup) {
    const practiceSetup = editSetup;
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
        body: JSON.stringify({
          practiceSetup,
          keepPracticeId: practiceSetup === "SINGLE" && locations.length > 1 ? keepId : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? "The practice license could not be updated.");
      }
      await loadPracticeGroups();
      setEditId("");
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
                        <Fragment key={group.id}>
                        <tr>
                          <td className="px-5 py-4">
                            <strong className="block text-slate-900">{group.name}</strong>
                            <span className="block text-xs text-slate-500">
                              {group.practiceSetup === "SINGLE" ? "Single practice" : "Multiple practices"}
                            </span>
                            <button
                              className="link-button mt-2 text-xs"
                              onClick={() => void openEdit(group)}
                              type="button"
                            >
                              {editId === group.id ? "Cancel edit" : "Edit license"}
                            </button>
                            <button
                              aria-expanded={managedId === group.id}
                              className="link-button ml-4 mt-2 text-xs"
                              onClick={() => void toggleManage(group)}
                              type="button"
                            >
                              {managedId === group.id ? "Hide shared codes" : "Shared codes"}
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
                        {editId === group.id && (
                          <tr className="bg-violet-50">
                            <td className="px-5 py-4" colSpan={6}>
                              <h3 className="text-sm font-semibold text-violet-950">
                                Edit license for {group.name}
                              </h3>
                              <label className="mt-3 block text-xs font-semibold text-slate-700">
                                License type
                                <select
                                  className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                  onChange={(event) => setEditSetup(event.target.value as "SINGLE" | "MULTIPLE")}
                                  value={editSetup}
                                >
                                  <option value="SINGLE">Single practice</option>
                                  <option value="MULTIPLE">Multiple practices</option>
                                </select>
                              </label>
                              {editSetup === "SINGLE" && locations.length > 1 && (
                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                                  <p className="font-semibold">
                                    This group has {locations.length} locations. Choose the one to keep:
                                  </p>
                                  {locations.map((location) => (
                                    <label className="mt-2 flex items-center gap-2" key={location.id}>
                                      <input
                                        checked={keepId === location.id}
                                        name={`keep-${group.id}`}
                                        onChange={() => setKeepId(location.id)}
                                        type="radio"
                                      />
                                      {location.name} ({location.accountCount} account
                                      {location.accountCount === 1 ? "" : "s"})
                                    </label>
                                  ))}
                                  <p className="mt-2 text-xs">
                                    Accounts and codes from the other locations move to the kept
                                    location, and the other locations are removed. This cannot be undone.
                                  </p>
                                </div>
                              )}
                              <div className="mt-4 flex gap-3">
                                <button
                                  className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                                  disabled={
                                    updatingLicense === group.id ||
                                    (editSetup === group.practiceSetup && !(editSetup === "SINGLE" && locations.length > 1)) ||
                                    (editSetup === "SINGLE" && locations.length > 1 && !keepId)
                                  }
                                  onClick={() => void saveLicense(group)}
                                  type="button"
                                >
                                  {updatingLicense === group.id ? "Saving…" : "Save license"}
                                </button>
                                <button
                                  className="link-button text-sm"
                                  onClick={() => setEditId("")}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {managedId === group.id && (
                          <tr className="bg-slate-50">
                            <td className="px-5 py-4" colSpan={6}>
                              <h3 className="text-sm font-semibold text-slate-900">
                                Codes shared with {group.name}
                              </h3>
                              <p className="mt-1 text-xs text-slate-500">
                                Codes issued from now on are shown here. Older codes were stored
                                only as hashes and cannot be displayed; reset them to issue a
                                replacement you can view.
                              </p>
                              {resetResult?.forId === group.id && (
                                <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
                                  New code
                                  {resetResult.emailed
                                    ? ` (emailed to ${resetResult.recipientEmail})`
                                    : resetResult.recipientEmail
                                      ? " (email could not be sent; share it manually)"
                                      : " (no email on file; share it manually)"}:{" "}
                                  <code className="break-all font-semibold">{resetResult.code}</code>
                                  <span className="block text-xs">
                                    Expires {new Date(resetResult.expiresAt).toLocaleString("en-GB")}
                                  </span>
                                </p>
                              )}
                              {codesLoading ? (
                                <p className="mt-3 text-sm text-slate-500" role="status">Loading codes…</p>
                              ) : codes.length === 0 ? (
                                <p className="mt-3 text-sm text-slate-600">No codes have been shared yet.</p>
                              ) : (
                                <table className="mt-3 w-full text-left text-xs">
                                  <thead className="uppercase tracking-wide text-slate-500">
                                    <tr>
                                      <th className="py-2 pr-4">Code</th>
                                      <th className="py-2 pr-4">Type</th>
                                      <th className="py-2 pr-4">Practice</th>
                                      <th className="py-2 pr-4">Sent to</th>
                                      <th className="py-2 pr-4">Issued by</th>
                                      <th className="py-2 pr-4">Created</th>
                                      <th className="py-2 pr-4">Expires</th>
                                      <th className="py-2 pr-4">Status</th>
                                      <th className="py-2" />
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {codes.map((code) => (
                                      <tr key={code.id}>
                                        <td className="py-2 pr-4">
                                          {code.code ? (
                                            <span className="flex items-center gap-2">
                                              <code className="break-all font-semibold text-slate-900">{code.code}</code>
                                              <button
                                                className="link-button"
                                                onClick={() => void navigator.clipboard.writeText(code.code ?? "")}
                                                type="button"
                                              >
                                                Copy
                                              </button>
                                            </span>
                                          ) : (
                                            <span className="text-slate-500">Not stored (issued earlier)</span>
                                          )}
                                        </td>
                                        <td className="py-2 pr-4 font-medium text-slate-800">{codeKindLabels[code.kind]}</td>
                                        <td className="py-2 pr-4">{code.practiceName ?? "—"}</td>
                                        <td className="py-2 pr-4">{code.recipientEmail ?? "Any email"}</td>
                                        <td className="py-2 pr-4">{code.issuedBy ?? "—"}</td>
                                        <td className="py-2 pr-4">{new Date(code.createdAt).toLocaleDateString("en-GB")}</td>
                                        <td className="py-2 pr-4">
                                          {code.expiresAt ? new Date(code.expiresAt).toLocaleDateString("en-GB") : "—"}
                                        </td>
                                        <td className="py-2 pr-4">
                                          {code.status === "USED" && code.redeemedBy
                                            ? `Used by ${code.redeemedBy}`
                                            : code.status.charAt(0) + code.status.slice(1).toLowerCase()}
                                        </td>
                                        <td className="space-x-4 whitespace-nowrap py-2">
                                          {code.canReset && (
                                            <button
                                              className="link-button"
                                              disabled={resettingId === code.id}
                                              onClick={() => void resetCode(group, code)}
                                              type="button"
                                            >
                                              {resettingId === code.id ? "Resetting…" : "Reset & resend"}
                                            </button>
                                          )}
                                          {code.canResend && (
                                            <button
                                              className="link-button"
                                              disabled={resettingId === code.id}
                                              onClick={() => void resendCode(group, code)}
                                              type="button"
                                            >
                                              Resend email
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
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
