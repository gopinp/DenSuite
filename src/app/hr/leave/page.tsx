"use client";

import { useMemo, useState, type FormEvent } from "react";

type LeaveEvent = {
  id: number;
  name: string;
  start: string;
  end: string;
  kind: "annual" | "toil" | "pending";
};

const initialLeave: LeaveEvent[] = [
  { id: 1, name: "Jamie Lee", start: "2026-10-06", end: "2026-10-09", kind: "annual" },
  { id: 2, name: "Taylor Morgan", start: "2026-10-14", end: "2026-10-16", kind: "annual" },
  { id: 3, name: "Casey Patel", start: "2026-10-16", end: "2026-10-16", kind: "annual" },
  { id: 4, name: "Alex Morgan", start: "2026-10-20", end: "2026-10-22", kind: "annual" },
  { id: 5, name: "Riley Kim", start: "2026-10-26", end: "2026-10-28", kind: "annual" },
  { id: 6, name: "Time in lieu", start: "2026-10-19", end: "2026-10-19", kind: "toil" },
];

const shortWeekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

export default function LeavePage() {
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(new Date()));
  const [leave, setLeave] = useState(initialLeave);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestStart, setRequestStart] = useState("");
  const [requestEnd, setRequestEnd] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [showAll, setShowAll] = useState(false);

  const days = useMemo(() => {
    const first = monthStart(visibleMonth);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  function changeMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestMessage("");
    if (!requestStart || !requestEnd || requestEnd < requestStart) {
      setRequestMessage("Choose a valid start and end date.");
      return;
    }

    const conflicts = leave.filter(
      (item) => item.kind !== "pending" && item.start <= requestEnd && item.end >= requestStart,
    );
    const id = Date.now();
    setLeave((items) => [
      ...items,
      { id, name: "Your request", start: requestStart, end: requestEnd, kind: "pending" },
    ]);
    setVisibleMonth(monthStart(new Date(`${requestStart}T12:00:00`)));
    setRequestOpen(false);
    setRequestStart("");
    setRequestEnd("");
    setRequestMessage(
      conflicts.length
        ? `Request added for review. It overlaps with ${conflicts.length} colleague ${
            conflicts.length === 1 ? "absence" : "absences"
          } so you can plan ahead.`
        : "Request added for review. It will appear as pending in the team calendar.",
    );
  }

  return (
    <section className="leave-page">
      <header className="leave-heading">
        <div>
          <p className="leave-eyebrow">TEAM PLANNING</p>
          <h1>Holiday calendar</h1>
          <p className="leave-description">
            See colleagues&apos; approved time off and choose dates that work for your team.
          </p>
        </div>
        <button className="leave-request-button" onClick={() => setRequestOpen(true)} type="button">
          <span aria-hidden="true">＋</span> Request time off
        </button>
      </header>

      <section className="leave-calendar-card" aria-label="Team holiday calendar">
        <div className="leave-calendar-toolbar">
          <button
            className="leave-today-button"
            onClick={() => setVisibleMonth(monthStart(new Date()))}
            type="button"
          >
            Today
          </button>
          <div className="leave-month-controls">
            <button
              aria-label="Previous month"
              className="leave-month-arrow"
              onClick={() => changeMonth(-1)}
              type="button"
            >
              ‹
            </button>
            <button
              aria-label="Next month"
              className="leave-month-arrow"
              onClick={() => changeMonth(1)}
              type="button"
            >
              ›
            </button>
            <h2>{formatMonth(visibleMonth)}</h2>
          </div>
          <div className="leave-legend">
            <span><i className="leave-legend-approved" /> Approved</span>
            <span><i className="leave-legend-pending" /> Pending</span>
          </div>
        </div>

        {requestMessage && (
          <p className="leave-feedback" role="status">{requestMessage}</p>
        )}

        <div className="leave-calendar-scroll">
          <div className="leave-calendar-grid">
            {shortWeekdays.map((day) => (
              <div className="leave-weekday" key={day}>
                {day}
              </div>
            ))}
            {days.map((date) => {
              const key = dateKey(date);
              const dayLeave = leave.filter((item) => item.start <= key && item.end >= key);
              const visibleEvents = showAll ? dayLeave : dayLeave.slice(0, 2);
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isToday = key === dateKey(new Date());
              return (
                <div
                  className={`leave-day${isCurrentMonth ? "" : " outside"}${isToday ? " today" : ""}`}
                  key={key}
                >
                  <span className="leave-day-number">
                    {date.getDate()}
                    {isToday && <span className="leave-today-label">Today</span>}
                  </span>
                  <div className="leave-day-events">
                    {visibleEvents.map((item) => (
                      <div
                        className={`leave-event ${item.kind}${
                          item.start === key ? " event-start" : ""
                        }${item.end === key ? " event-end" : ""}`}
                        key={item.id}
                        title={`${item.name}${item.kind === "pending" ? " · Pending" : " · Approved"}`}
                      >
                        {item.start === key ? item.name : "\u00a0"}
                        {item.kind === "pending" && item.start === key && (
                          <span className="leave-event-status">Pending</span>
                        )}
                      </div>
                    ))}
                    {!showAll && dayLeave.length > visibleEvents.length && (
                      <button
                        className="leave-more"
                        onClick={() => setShowAll(true)}
                        type="button"
                      >
                        +{dayLeave.length - visibleEvents.length} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="leave-calendar-note">
          Approved absences are visible to the team. Pending requests are shown as pending and are
          not yet approved.
        </p>
      </section>

      {requestOpen && (
        <div className="leave-modal-backdrop" role="presentation">
          <section
            aria-labelledby="leave-request-title"
            aria-modal="true"
            className="leave-modal"
            role="dialog"
          >
            <div className="leave-modal-heading">
              <div>
                <p className="leave-eyebrow">PLAN AHEAD</p>
                <h2 id="leave-request-title">Request time off</h2>
              </div>
              <button
                aria-label="Close request form"
                className="leave-modal-close"
                onClick={() => setRequestOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <p className="leave-modal-description">
              Check the team calendar, then choose the dates you&apos;d like to request.
            </p>
            <form className="leave-request-form" onSubmit={submitRequest}>
              <label>
                Start date
                <input
                  onChange={(event) => setRequestStart(event.target.value)}
                  required
                  type="date"
                  value={requestStart}
                />
              </label>
              <label>
                End date
                <input
                  min={requestStart || undefined}
                  onChange={(event) => setRequestEnd(event.target.value)}
                  required
                  type="date"
                  value={requestEnd}
                />
              </label>
              {requestMessage && <p className="leave-form-error" role="alert">{requestMessage}</p>}
              <button className="leave-request-button leave-submit-button" type="submit">
                Send request for review
              </button>
              <p className="leave-form-note">
                This demo adds your request to the calendar as pending. It does not send it to a
                manager yet.
              </p>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
