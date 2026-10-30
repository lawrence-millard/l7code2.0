import type { SVGProps } from "react";

/** Compact L7 wordmark for sidebar chrome (Zeron-style brand signal). */
export function L7Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 64 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="L7 Code"
      role="img"
    >
      <text
        x="0"
        y="24"
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="28"
        fontWeight="700"
        letterSpacing="-0.06em"
      >
        L7
      </text>
    </svg>
  );
}

/** @deprecated Prefer L7Wordmark; kept as alias during the rename. */
export { L7Wordmark as T3Wordmark };
