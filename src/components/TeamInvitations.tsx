"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getKeycloak, initializeKeycloak } from "../lib/keycloak";

type TeamInvitation = {
  id: string;
  kind: "MANAGER_CODE" | "EMPLOYEE_CODE";
  practiceName: string | null;
  email: string | null;
  jobRole: string | null;
  employeeNumber: string | null;
  issuedBy: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  redeemedBy: string | null;
  status: "ACTIVE" | "USED" | "EXPIRED" | "REVOKED";
  code: string | null;
};

const apiBase = process.env.NEXT_PUBLIC_DENTSTAFF_API_URL ?? "http://localhost:8085";

const roleLabels: Record<string, string> = {
  PRACTICE_MANAGER: "Practice manager",
  DENTIST: "Dentist",
  DENTAL_NURSE: "Dental nurse",
  HEAD_NURSE: "Head nurse",
  DENTAL_RECEPTIONIST: "Dental receptionist",
};

export default function TeamInvitations({
  kind,
  refreshKey,
  title,
  emptyText,
}: {
  kind: "MANAGER_CODE" | "EMPLOYEE_CODE";
  refreshKey: number;
  title: string;
  emptyText: string;
}) {
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<TeamInvitation | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("DENTIST");
  const [editNumber, setEditNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    await initializeKeycloak();
    const keycloak = getKeycloak();
    await keycloak.updateToken(30);
    return fetch(`${apiBase}/api/v1/accounts/team-invitations${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${keycloak.token}`,
        "Content-Type": "application/json",
      },
    });
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await authorizedFetch(`?r=${refreshKey}-${reload}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "Invitations could not be loaded.");
        if (active) {
          setInvitations((result as TeamInvitation[]).filter((item) => item.kind === kind));
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Invitations could not be loaded.");
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [authorizedFetch, kind, refreshKey, reload]);

  function startEdit(invitation: TeamInvitation) {
    setEditing(invitation);
    setEditEmail(invitation.email ?? "");
    setEditRole(invitation.jobRole ?? "DENTIST");
    setEditNumber(invitation.employeeNumber ?? "");
    setMessage("");
  }

  async function replace(invitation: TeamInvitation, body: Record<string, string>, success: string) {
    setMessage("");
    setSaving(true);
    try {
      const response = await authorizedFetch(`/${invitation.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "The invitation could not be updated.");
      setMessage(`${success} New code: ${result.code}${result.emailed ? " (emailed)." : "."}`);
      setEditing(null);
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    await replace(
      editing,
      {
        email: editEmail,
        jobRole: editing.kind === "MANAGER_CODE" ? "" : editRole,
        employeeNumber: editNumber,
      },
      "Invitation updated.",
    );
  }

  async function regenerate(invitation: TeamInvitation) {
    if (!window.confirm(
      `Generate a new code for ${invitation.email ?? "this invitation"}? The old code stops working and the new one is emailed.`,
    )) return;
    await replace(invitation, {}, "New code generated.");
  }

  async function revoke(invitation: TeamInvitation) {
    if (!window.confirm(`Revoke the invitation for ${invitation.email ?? "this colleague"}?`)) return;
    setMessage("");
    try {
      const response = await authorizedFetch(`/${invitation.id}/revoke`, { method: "POST" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message ?? "The invitation could not be revoked.");
      }
      setMessage("Invitation revoked.");
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be revoked.");
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Code copied. Share it privately; it can only be used once.");
    } catch {
      setMessage("Copy failed. Select and copy the code manually.");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">
          View, regenerate, edit or revoke the codes you have shared.
        </p>
      </div>

      {message && (
        <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900" role="status">{message}</p>
      )}

      {editing && (
        <form
          className="grid gap-4 rounded-xl border border-violet-200 bg-violet-50/40 p-5 md:grid-cols-3"
          onSubmit={saveEdit}
        >
          <label className="text-sm font-medium text-slate-700">
            Email address
            <input
              className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
              maxLength={254}
              onChange={(event) => setEditEmail(event.target.value)}
              required
              type="email"
              value={editEmail}
            />
          </label>
          {editing.kind === "EMPLOYEE_CODE" && (
            <label className="text-sm font-medium text-slate-700">
              Role
              <select
                className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                onChange={(event) => setEditRole(event.target.value)}
                value={editRole}
              >
                <option value="DENTIST">Dentist</option>
                <option value="DENTAL_NURSE">Dental nurse</option>
                <option value="HEAD_NURSE">Head nurse</option>
                <option value="DENTAL_RECEPTIONIST">Dental receptionist</option>
              </select>
            </label>
          )}
          <label className="text-sm font-medium text-slate-700">
            Employee number
            <input
              className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
              maxLength={30}
              onChange={(event) => setEditNumber(event.target.value)}
              value={editNumber}
            />
          </label>
          <p className="text-xs leading-5 text-slate-600 md:col-span-3">
            Saving issues a new code, stops the old one working and emails the new code.
          </p>
          <div className="flex gap-3 md:col-span-3">
            <button
              className="min-h-11 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Saving…" : "Save and resend"}
            </button>
            <button
              className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setEditing(null)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {invitations.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Colleague</th>
                <th className="px-4 py-3">Employee no.</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Registered as</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="px-4 py-4">
                    <strong className="block text-slate-900">{invitation.email ?? "—"}</strong>
                    <span className="text-xs text-slate-500">
                      {roleLabels[invitation.jobRole ?? ""] ?? "Employee"} · {invitation.practiceName ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-700">
                    {invitation.employeeNumber ?? "—"}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        invitation.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {invitation.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">
                    {invitation.code ? (
                      <span className="flex items-center gap-2">
                        <code className="select-all font-semibold text-violet-800">{invitation.code}</code>
                        <button
                          className="link-button"
                          onClick={() => void copyCode(invitation.code as string)}
                          type="button"
                        >
                          Copy
                        </button>
                      </span>
                    ) : (
                      <span className="text-slate-400">Not retrievable</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {invitation.expiresAt ? new Date(invitation.expiresAt).toLocaleString("en-GB") : "—"}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{invitation.redeemedBy ?? "—"}</td>
                  <td className="px-4 py-4 text-right">
                    {invitation.status !== "USED" && (
                      <div className="flex justify-end gap-3">
                        <button
                          className="link-button"
                          onClick={() => void regenerate(invitation)}
                          type="button"
                        >
                          Regenerate &amp; resend
                        </button>
                        <button className="link-button" onClick={() => startEdit(invitation)} type="button">
                          Edit
                        </button>
                        {invitation.status === "ACTIVE" && (
                          <button
                            className="link-button text-rose-700"
                            onClick={() => void revoke(invitation)}
                            type="button"
                          >
                            Revoke
                          </button>
                        )}
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
  );
}
