"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { getKeycloak, initializeKeycloak } from "../../../lib/keycloak";
import { usePracticeContext } from "../../../components/PracticeContext";

type Practice = { id: string; name: string };
type PracticesResponse = { practices: Practice[] };
type Invitation = { code: string; practiceName: string; expiresAt: string };

const apiBase = process.env.NEXT_PUBLIC_DENTSTAFF_API_URL ?? "http://localhost:8085";

export default function EmployeesPage() {
  const { selectedPracticeId, setSelectedPracticeId } = usePracticeContext();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [practiceId, setPracticeId] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadPractices() {
      try {
        await initializeKeycloak();
        const keycloak = getKeycloak();
        await keycloak.updateToken(30);
        const response = await fetch(`${apiBase}/api/v1/accounts/practices`, {
          headers: { Authorization: `Bearer ${keycloak.token}` },
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message ?? "Practices could not be loaded.");
        }
        const availablePractices = (result as PracticesResponse).practices;
        setPractices(availablePractices);
        const selectedId = availablePractices.some((practice) => practice.id === selectedPracticeId)
          ? selectedPracticeId
          : "";
        setPracticeId(selectedId);
        if (selectedId) setSelectedPracticeId(selectedId);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load practices. Try again or contact your administrator.",
        );
      } finally {
        setLoading(false);
      }
    }
    void loadPractices();
  }, [selectedPracticeId, setSelectedPracticeId]);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setInvitation(null);
    setSubmitting(true);
    try {
      await initializeKeycloak();
      const keycloak = getKeycloak();
      await keycloak.updateToken(30);
      const response = await fetch(`${apiBase}/api/v1/accounts/invitations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ practiceId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? "The invitation could not be created.");
      }
      setInvitation(result as Invitation);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the invitation. Try again or contact your administrator.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInvitationCode() {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.code);
      setMessage("Invite code copied. Share it with the employee; it can only be used once.");
    } catch {
      setMessage("Copy failed. Select and copy the invite code manually.");
    }
  }

  return (
    <section className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-700">
          DEN STAFF
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Employees</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Invite employees to a practice with a private, single-use registration code.
        </p>
        <Link className="mt-3 inline-block text-sm font-semibold text-violet-700 hover:text-violet-900"
          href="/hr/practices">
          Manage practice locations and practice managers →
        </Link>
      </div>

      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Create employee invite</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The invite is tied to the selected practice, expires in seven days, and can only be used
          once. Share it directly with the colleague you are inviting.
        </p>

        {loading ? (
          <p className="mt-5 text-sm text-slate-500" role="status">Loading your practices…</p>
        ) : practices.length === 0 ? (
          <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600" role="status">
            {message || "No practices are available for this account."}
          </p>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={createInvitation}>
            <label className="block text-sm font-medium text-slate-700" htmlFor="invite-practice">
              Practice
              <select
                className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                id="invite-practice"
                onChange={(event) => {
                  setPracticeId(event.target.value);
                  setSelectedPracticeId(event.target.value);
                }}
                required
                value={practiceId}
              >
                <option value="">Select a practice</option>
                {practices.map((practice) => (
                  <option key={practice.id} value={practice.id}>{practice.name}</option>
                ))}
              </select>
            </label>
            <button
              className="min-h-11 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60"
              disabled={submitting || !practiceId}
              type="submit"
            >
              {submitting ? "Creating invite…" : "Create invite code"}
            </button>
          </form>
        )}

        {message && practices.length > 0 && (
          <p className="mt-4 rounded-lg bg-violet-50 p-3 text-sm text-violet-900" role="status">
            {message}
          </p>
        )}

        {invitation && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-950">
              Invite created for {invitation.practiceName}
            </p>
            <code className="mt-3 block break-all rounded-lg bg-white px-3 py-3 font-mono text-sm text-slate-900">
              {invitation.code}
            </code>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-emerald-900">
                Expires {new Date(invitation.expiresAt).toLocaleString("en-GB")}
              </p>
              <button
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                onClick={copyInvitationCode}
                type="button"
              >
                Copy code
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-emerald-900">
              This code is shown only once. Send it privately to the intended employee.
            </p>
          </div>
        )}
      </div>

    </section>
  );
}
