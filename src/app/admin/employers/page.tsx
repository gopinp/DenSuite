"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getKeycloak, initializeKeycloak } from "../../../lib/keycloak";

type Invitation = {
  id: string;
  issuedBy: string;
  createdAt: string;
  expiresAt: string;
  email: string;
  organizationName: string;
  practiceSetup: "SINGLE" | "MULTIPLE";
  usedAt: string | null;
  redeemedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  status: "ACTIVE" | "USED" | "EXPIRED" | "REVOKED";
};

type CreatedInvitation = Pick<
  Invitation,
  "id" | "email" | "organizationName" | "practiceSetup" | "expiresAt"
> & { code: string };

const apiBase = process.env.NEXT_PUBLIC_DENTSTAFF_API_URL ?? "http://localhost:8085";

export default function EmployerInvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [practiceSetup, setPracticeSetup] = useState<"SINGLE" | "MULTIPLE">("SINGLE");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const [message, setMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingInvitationId, setEditingInvitationId] = useState<string | null>(null);
  const [visibleCodes, setVisibleCodes] = useState<Record<string, string>>({});

  const loadInvitations = useCallback(async () => {
    const keycloak = getKeycloak();
    await keycloak.updateToken(30);
    const response = await fetch(`${apiBase}/api/v1/admin/employer-invitations`, {
      headers: { Authorization: `Bearer ${keycloak.token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message ?? "Employer invitations could not be loaded.");
    }
    setInvitations(result as Invitation[]);
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
        await loadInvitations();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Employer invitations could not be loaded. Try again or contact support.",
        );
      } finally {
        setLoading(false);
      }
    }
    void initialize();
  }, [loadInvitations]);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setCreatedInvitation(null);
    setSubmitting(true);
    try {
      const keycloak = getKeycloak();
      await keycloak.updateToken(30);
      const response = await fetch(`${apiBase}/api/v1/admin/employer-invitations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, organizationName, practiceSetup, expiresInDays }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? "The employer invitation could not be created.");
      }
      const sent = result as CreatedInvitation;
      setCreatedInvitation(sent);
      setVisibleCodes((current) => ({ ...current, [sent.id]: sent.code }));
      setMessage(`Invitation email sent to ${sent.email}.`);
      setEmail("");
      setOrganizationName("");
      await loadInvitations();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The employer invitation could not be created. Try again or contact support.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function startEditingInvitation(invitation: Invitation) {
    setEditingInvitationId(invitation.id);
    setEmail(invitation.email);
    setOrganizationName(invitation.organizationName);
    setPracticeSetup(invitation.practiceSetup);
    setExpiresInDays(7);
    setCreatedInvitation(null);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditingInvitation() {
    setEditingInvitationId(null);
    setEmail("");
    setOrganizationName("");
    setPracticeSetup("SINGLE");
    setExpiresInDays(7);
    setMessage("");
  }

  async function saveInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingInvitationId) return;
    setMessage("");
    setCreatedInvitation(null);
    setSubmitting(true);
    try {
      const keycloak = getKeycloak();
      await keycloak.updateToken(30);
      const response = await fetch(
        `${apiBase}/api/v1/admin/employer-invitations/${editingInvitationId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, organizationName, practiceSetup, expiresInDays }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? "The employer invitation could not be updated.");
      }
      const sent = result as CreatedInvitation;
      setCreatedInvitation(sent);
      setVisibleCodes((current) => ({ ...current, [sent.id]: sent.code }));
      setEditingInvitationId(null);
      setEmail("");
      setOrganizationName("");
      setPracticeSetup("SINGLE");
      setExpiresInDays(7);
      setMessage(`Invitation updated and replacement code emailed to ${sent.email}.`);
      await loadInvitations();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The employer invitation could not be updated. Try again or contact support.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) return;
    setMessage("");
    try {
      const keycloak = getKeycloak();
      await keycloak.updateToken(30);
      const response = await fetch(
        `${apiBase}/api/v1/admin/employer-invitations/${invitation.id}/revoke`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${keycloak.token}` },
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message ?? "The employer invitation could not be revoked.");
      }
      setMessage(`Invitation for ${invitation.email} revoked.`);
      await loadInvitations();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The employer invitation could not be revoked. Try again or contact support.",
      );
    }
  }

  return (
    <main className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-700">
          DENTSUITE ADMIN
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Employer onboarding</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Create a one-time invitation for an employer. Den Suite emails the registration code to
          the employer and ties it to the practice details and email address below.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500" role="status">Loading admin access…</p>
      ) : !isAdmin ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          This page is available only to Den Suite administrators. Ask an administrator to assign
          you the <code>DENTSUITE_ADMIN</code> role, then sign in again.
        </p>
      ) : (
        <>
          <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              {editingInvitationId ? "Edit employer invitation" : "Invite an employer"}
            </h2>
            <form
              className="mt-5 space-y-5"
              onSubmit={(event) => void (editingInvitationId ? saveInvitation(event) : createInvitation(event))}
            >
              <label className="block text-sm font-medium text-slate-700" htmlFor="practice-name">
                Practice or group name
                <input
                  autoComplete="organization"
                  className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  id="practice-name"
                  maxLength={160}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  required
                  value={organizationName}
                />
              </label>

              <fieldset>
                <legend className="text-sm font-medium text-slate-700">Practice setup</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(["SINGLE", "MULTIPLE"] as const).map((setup) => (
                    <label
                      className={`cursor-pointer rounded-xl border p-4 text-sm ${
                        practiceSetup === setup
                          ? "border-violet-500 bg-violet-50 text-violet-950"
                          : "border-slate-200 text-slate-700"
                      }`}
                      key={setup}
                    >
                      <input
                        checked={practiceSetup === setup}
                        className="mr-2 accent-violet-700"
                        name="practice-setup"
                        onChange={() => setPracticeSetup(setup)}
                        type="radio"
                        value={setup}
                      />
                      <span className="font-semibold">
                        {setup === "SINGLE" ? "Single practice" : "Multiple practices"}
                      </span>
                      <span className="mt-1 block pl-6 text-xs text-slate-500">
                        {setup === "SINGLE" ? "One practice location" : "More than one location"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block text-sm font-medium text-slate-700" htmlFor="employer-email">
                Employer email address
                <input
                  autoComplete="email"
                  className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  id="employer-email"
                  maxLength={254}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>

              <label className="block text-sm font-medium text-slate-700" htmlFor="expiry">
                Code expires after
                <select
                  className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  id="expiry"
                  onChange={(event) => setExpiresInDays(Number(event.target.value))}
                  value={expiresInDays}
                >
                  {[1, 3, 7, 14, 30].map((days) => (
                    <option key={days} value={days}>{days} {days === 1 ? "day" : "days"}</option>
                  ))}
                </select>
              </label>

              <button
                className="min-h-11 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60"
                disabled={submitting}
                type="submit"
              >
                {submitting
                  ? editingInvitationId ? "Updating invitation…" : "Sending invitation…"
                  : editingInvitationId ? "Save and email replacement code" : "Generate and email code"}
              </button>
              {editingInvitationId && (
                <div>
                  <p className="mb-3 text-xs text-amber-800">
                    Saving revokes the old code and issues a new one. The previous code cannot be recovered.
                  </p>
                  <button
                    className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                    onClick={cancelEditingInvitation}
                    type="button"
                  >
                    Cancel edit
                  </button>
                </div>
              )}
            </form>
            {message && (
              <p
                className="mt-4 rounded-lg bg-violet-50 p-3 text-sm text-violet-950"
                role="status"
              >
                {message}
              </p>
            )}
            {createdInvitation && (
              <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
                <p className="font-semibold">
                  One-time code: <code className="select-all">{createdInvitation.code}</code>
                </p>
                <p className="mt-1 text-xs leading-5">
                  Valid until {new Date(createdInvitation.expiresAt).toLocaleString("en-GB")}. The
                  code is stored as a hash and will not be available after leaving or reloading this page.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Invitation history</h2>
              <p className="mt-1 text-sm text-slate-600">
                New codes are shown once after issuance. Earlier codes cannot be recovered because only their hashes are stored.
              </p>
            </div>
            {invitations.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                No employer invitations have been created yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Practice and employer</th>
                      <th className="px-4 py-3">Issued</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Expires</th>
                      <th className="px-4 py-3">Redeemed by</th>
                      <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invitations.map((invitation) => (
                      <tr key={invitation.id}>
                        <td className="px-4 py-4">
                          <strong className="block text-slate-900">{invitation.organizationName}</strong>
                          <span className="text-slate-500">{invitation.email}</span>
                          <span className="mt-1 block text-xs text-slate-400">
                            {invitation.practiceSetup === "SINGLE" ? "Single practice" : "Multiple practices"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          <span className="block">
                            {new Date(invitation.createdAt).toLocaleString("en-GB")}
                          </span>
                          <span className="mt-1 block max-w-40 truncate text-xs text-slate-400" title={invitation.issuedBy}>
                            Issuer: {invitation.issuedBy}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            invitation.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {invitation.status.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-slate-600">
                          {visibleCodes[invitation.id] ? (
                            <code className="select-all font-semibold text-violet-800">
                              {visibleCodes[invitation.id]}
                            </code>
                          ) : (
                            <span className="text-slate-400">Not retrievable</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {new Date(invitation.expiresAt).toLocaleString("en-GB")}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {invitation.redeemedBy ?? "—"}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {invitation.status === "ACTIVE" && (
                            <div className="flex justify-end gap-3">
                              <button
                                className="font-semibold text-violet-700 hover:text-violet-900"
                                onClick={() => startEditingInvitation(invitation)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="font-semibold text-rose-700 hover:text-rose-900"
                                onClick={() => void revokeInvitation(invitation)}
                                type="button"
                              >
                                Revoke
                              </button>
                            </div>
                          )}
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
    </main>
  );
}
