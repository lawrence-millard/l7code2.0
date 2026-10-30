import type { SVGProps } from "react";

/** Dominant L7 brand mark for shell chrome and new-session canvas. */
export function L7Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 88 36"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="L7 Code"
      role="img"
      fill="none"
    >
      <rect
        x="1"
        y="1"
        width="34"
        height="34"
        rx="10"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.28"
      />
      <path
        d="M10 9.5V26.5H25.5"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M45 8.5H54.2C60.1 8.5 64 11.9 64 17.2C64 22.6 60.1 26 54.2 26H45V8.5Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M54.4 26L65.5 27.6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="74.5" cy="26" r="2.4" fill="currentColor" />
    </svg>
  );
}

/** Full wordmark used where brand must read as a hero signal. */
export function L7CodeWordmark({
  className,
  ...props
}: SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg
      {...props}
      className={className}
      viewBox="0 0 220 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="L7 Code"
      role="img"
      fill="none"
    >
      <rect
        x="1"
        y="5"
        width="38"
        height="38"
        rx="11"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.3"
      />
      <path
        d="M11 13.5V32.5H28"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M52 12H63.5C71.2 12 76.5 16.4 76.5 23.4C76.5 30.5 71.2 35 63.5 35H52V12Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="M63.8 35L78 37"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <text
        x="92"
        y="33"
        fill="currentColor"
        fontFamily="var(--font-brand), ui-sans-serif, system-ui, sans-serif"
        fontSize="28"
        fontWeight="650"
        letterSpacing="-0.04em"
      >
        Code
      </text>
    </svg>
  );
}

/** @deprecated Prefer L7Wordmark; kept as alias during the rename. */
export { L7Wordmark as T3Wordmark };
