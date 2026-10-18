"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getKeycloak, initializeKeycloak } from "../../../lib/keycloak";

type Practice = {
  id: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  practiceSetup: "SINGLE" | "MULTIPLE";
};

type Invitation = {
  code: string;
  practiceName: string;
  expiresAt: string;
};

type PracticesResult = {
  practiceSetup: "SINGLE" | "MULTIPLE";
  practices: Practice[];
};

const apiBase = process.env.NEXT_PUBLIC_DENTSTAFF_API_URL ?? "http://localhost:8085";

export default function PracticesPage() {
  const [practices, setPractices] = useState<Practice[]>([]);
  const [practiceId, setPracticeId] = useState("");
  const [editingPracticeId, setEditingPracticeId] = useState("");
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [managerEmail, setManagerEmail] = useState("");
  const [selfManaging, setSelfManaging] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [practiceSetup, setPracticeSetup] = useState<"SINGLE" | "MULTIPLE">("SINGLE");

  const loadPractices = useCallback(async () => {
    const keycloak = getKeycloak();
    await keycloak.updateToken(30);
    const response = await fetch(`${apiBase}/api/v1/accounts/practices`, {
      headers: { Authorization: `Bearer ${keycloak.token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message ?? "Practices could not be loaded.");
    }
    const practiceResult = result as PracticesResult;
    const loaded = practiceResult.practices;
    setPracticeSetup(practiceResult.practiceSetup);
    setPractices(loaded);
    setPracticeId((current) => loaded.some((practice) => practice.id === current)
      ? current
      : loaded[0]?.id ?? "");
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        await initializeKeycloak();
        const keycloak = getKeycloak();
        const owner = keycloak.hasRealmRole("EMPLOYER");
        const manager = keycloak.hasRealmRole("PRACTICE_MANAGER");
        if (!owner && !manager) {
          setMessage("Practice setup is available to practice owners and managers.");
          return;
        }
        setAccessAllowed(true);
        setIsOwner(owner);
        await loadPractices();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Practices could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void initialize();
  }, [loadPractices]);

  async function addPractice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      const keycloak = getKeycloak();
      await keycloak.updateToken(30);
      const response = await fetch(
        `${apiBase}/api/v1/accounts/practices${editingPracticeId ? `/${editingPracticeId}` : ""}`,
        {
        method: editingPracticeId ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, addressLine1, addressLine2, city, region, postcode, country }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? "The practice could not be added.");
      }
      setName("");
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setRegion("");
      setPostcode("");
      const wasEditing = Boolean(editingPracticeId);
      setEditingPracticeId("");
      await loadPractices();
      setMessage(wasEditing
        ? `${result.name} updated.`
        : `${result.name} added to your practice group.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The practice could not be added.");
    } finally {
      setSubmitting(false);
    }
  }

  async function inviteManager(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setInvitation(null);
    setSubmitting(true);
    try {
      const keycloak = getKeycloak();
      await keycloak.updateToken(30);
      const response = await fetch(`${apiBase}/api/v1/accounts/invitations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ practiceId, practiceManager: true, managerEmail }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? "The practice manager code could not be created.");
      }
      setInvitation(result as Invitation);
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : "The practice manager code could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInvitationCode() {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.code);
      setMessage("Manager code copied. Share it privately; it can only be used once.");
    } catch {
      setMessage("Copy failed. Select and copy the manager code manually.");
    }
  }

  function editPractice(practice: Practice) {
    setEditingPracticeId(practice.id);
    setName(practice.name);
    setAddressLine1(practice.addressLine1 ?? "");
    setAddressLine2(practice.addressLine2 ?? "");
    setCity(practice.city ?? "");
    setRegion(practice.region ?? "");
    setPostcode(practice.postcode ?? "");
    setCountry(practice.country ?? "United Kingdom");
    setMessage("");
  }

  function cancelEdit() {
    setEditingPracticeId("");
    setName("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setRegion("");
    setPostcode("");
    setCountry("United Kingdom");
  }

  const canAddPractice = practiceSetup === "MULTIPLE" || practices.length === 0;

  return (
    <main className="space-y-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-700">
            PRACTICE SETUP
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Practices and managers</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Manage the locations in your group and create a single-use registration code for each
            practice manager. Managers can then invite their own employees.
          </p>
        </div>

        {message && (
          <p className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950" role="status">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-500" role="status">Loading your practice details…</p>
        ) : !accessAllowed ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            {message || "You do not have access to practice setup."}
          </p>
        ) : (
          <>
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-900">Your practice locations</h2>
              <p className="text-sm text-slate-600">
                Your Den Suite license allows {practiceSetup === "SINGLE" ? "one practice location" : "multiple practice locations"}.
              </p>
              {isOwner && practiceSetup === "SINGLE" && (
                <p className="text-sm text-slate-500">
                  To add more locations, contact Den Suite Admin to request a license upgrade.
                </p>
              )}
              {practices.length === 0 ? (
                <p className="rounded-xl bg-white p-5 text-sm text-slate-600">
                  No practice locations are linked to this account.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {practices.map((practice) => (
                    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={practice.id}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-slate-900">{practice.name}</h3>
                        {isOwner && (
                          <button
                            className="text-sm font-semibold text-violet-700 hover:text-violet-900"
                            onClick={() => editPractice(practice)}
                            type="button"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {[practice.addressLine1, practice.addressLine2, practice.city, practice.region,
                          practice.postcode, practice.country].filter(Boolean).join(", ") || "Address not available"}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {isOwner && (canAddPractice || Boolean(editingPracticeId)) && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingPracticeId
                    ? "Edit practice details"
                    : practices.length === 0
                      ? "Register your practice"
                      : "Add another practice"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {editingPracticeId
                    ? "Update this practice name and address."
                    : "Register a location with its address. Once it is set up, you can invite its manager."}
                </p>
                <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={addPractice}>
                  <label className="text-sm font-medium text-slate-700">
                    Practice name
                    <input className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3"
                      maxLength={160} onChange={(event) => setName(event.target.value)} required value={name} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Address line 1
                    <input autoComplete="address-line1" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3"
                      maxLength={160} onChange={(event) => setAddressLine1(event.target.value)} required value={addressLine1} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Address line 2 (optional)
                    <input autoComplete="address-line2" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3"
                      maxLength={160} onChange={(event) => setAddressLine2(event.target.value)} value={addressLine2} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Town or city
                    <input autoComplete="address-level2" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3"
                      maxLength={100} onChange={(event) => setCity(event.target.value)} required value={city} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    County or region (optional)
                    <input autoComplete="address-level1" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3"
                      maxLength={100} onChange={(event) => setRegion(event.target.value)} value={region} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Postcode
                    <input autoComplete="postal-code" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3"
                      maxLength={24} onChange={(event) => setPostcode(event.target.value)} required value={postcode} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Country
                    <input autoComplete="country-name" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3"
                      maxLength={80} onChange={(event) => setCountry(event.target.value)} required value={country} />
                  </label>
                  <div className="flex items-end">
                    <div className="flex flex-wrap gap-3">
                      <button className="min-h-11 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
                        disabled={submitting} type="submit">
                        {submitting
                          ? editingPracticeId ? "Saving…" : "Adding practice…"
                          : editingPracticeId ? "Save practice" : "Add practice"}
                      </button>
                      {editingPracticeId && (
                        <button className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={cancelEdit} type="button">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Add a practice manager</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Generate a private, one-use code tied to the manager&apos;s email. After registering
                with that email, they will have practice manager access and can create employee codes.
              </p>
              {isOwner && (
                <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <input
                    checked={selfManaging}
                    className="mt-1 accent-violet-700"
                    onChange={(event) => {
                      setSelfManaging(event.target.checked);
                      setInvitation(null);
                    }}
                    type="checkbox"
                  />
                  <span>
                    <strong className="block">I will manage this practice myself</strong>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">
                      Your owner account can already manage this location and create employee codes.
                    </span>
                  </span>
                </label>
              )}
              {selfManaging ? (
                <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
                  Your owner account is the practice manager. You can create employee invite codes from the Employees page.
                </p>
              ) : (
                practices.length > 0 ? (
                  <form className="mt-5 flex flex-wrap items-end gap-4" onSubmit={inviteManager}>
                    <label className="block min-w-64 text-sm font-medium text-slate-700" htmlFor="manager-practice">
                      Practice
                      <select className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                        id="manager-practice" onChange={(event) => setPracticeId(event.target.value)}
                        required value={practiceId}>
                        {practices.map((practice) => (
                          <option key={practice.id} value={practice.id}>{practice.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block min-w-64 text-sm font-medium text-slate-700" htmlFor="manager-email">
                      Manager email address
                      <input autoComplete="email" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 px-3"
                        id="manager-email" maxLength={254} onChange={(event) => setManagerEmail(event.target.value)}
                        required type="email" value={managerEmail} />
                    </label>
                    <button className="min-h-11 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
                      disabled={submitting || !practiceId} type="submit">
                      {submitting ? "Creating code…" : "Create manager code"}
                    </button>
                  </form>
                ) : (
                  <p className="mt-4 text-sm text-slate-600">Add a practice location before creating its manager code.</p>
                )
              )}
              {invitation && (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-950">
                    Manager code for {invitation.practiceName}
                  </p>
                  <code className="mt-3 block break-all rounded-lg bg-white px-3 py-3 font-mono text-sm text-slate-900">
                    {invitation.code}
                  </code>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-emerald-900">
                      Expires {new Date(invitation.expiresAt).toLocaleString("en-GB")}
                    </p>
                    <button className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                      onClick={copyInvitationCode} type="button">
                      Copy code
                    </button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-emerald-900">
                    Share this code privately. It can be used once and expires in seven days.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
