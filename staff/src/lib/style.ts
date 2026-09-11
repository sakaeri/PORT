import type { CSSProperties } from "react";

// CSS custom properties aren't part of the strict fontWeight union csstype
// exposes, but they're valid CSS. Cast through the property's own type
// instead of `any` so this stays a narrow, intentional escape hatch.
export const headingWeight = "var(--font-heading-weight)" as CSSProperties["fontWeight"];
