import { KivoLogo, KivoMark } from "../brand/logo";

// The brand logo has fixed ink/paper tones. Render both and show the one for the theme:
// the hidden one is display:none, so assistive tech only sees one "Kivo".

export function ThemedLogo({ size = 26 }: { size?: number }) {
  return (
    <>
      <span className="dark:hidden">
        <KivoLogo size={size} tone="ink" />
      </span>
      <span className="hidden dark:block">
        <KivoLogo size={size} tone="paper" />
      </span>
    </>
  );
}

export function ThemedMark({ size = 26 }: { size?: number }) {
  return (
    <>
      <span className="dark:hidden">
        <KivoMark size={size} tone="ink" />
      </span>
      <span className="hidden dark:block">
        <KivoMark size={size} tone="paper" />
      </span>
    </>
  );
}
