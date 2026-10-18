export default function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark${small ? " brand-mark-small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M16 3.5c-5.4 0-9.6 3.3-9.6 8.5 0 4.3 2.1 7 3.1 11.2.6 2.4 1.2 5.2 3 5.2 1.3 0 1.8-2.4 2.1-4.6.3-2.1.6-3.3 1.4-3.3s1.1 1.2 1.4 3.3c.3 2.2.8 4.6 2.1 4.6 1.8 0 2.4-2.8 3-5.2 1-4.2 3.1-6.9 3.1-11.2 0-5.2-4.2-8.5-9.6-8.5Z"
          fill="currentColor"
        />
        <path
          d="M11.5 12.5h9m-4.5-4.5v9"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
