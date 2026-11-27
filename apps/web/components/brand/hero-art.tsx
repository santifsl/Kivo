import { useId } from "react";
import styles from "./brand.module.css";

// Ridge layers, back to front, on a 1440×900 canvas, rising from the bottom right.
// Generated once by midpoint displacement (fixed seeds) and pasted in as constants.
const FAR_EDGE =
  "M440 900 471 848 502 810 534 773 565 734 596 711 628 677 659 664 690 649 721 634 752 622 784 617 815 601 846 577 878 564 909 562 940 552 971 534 1002 522 1034 515 1065 516 1096 507 1128 507 1159 502 1190 501 1221 491 1252 472 1284 445 1315 425 1346 417 1378 407 1409 410 1440 410";
const MID =
  "M640 900 665 885 690 874 715 869 740 871 765 860 790 858 815 854 840 856 865 841 890 826 915 816 940 807 965 798 990 786 1015 781 1040 772 1065 763 1090 756 1115 749 1140 750 1165 731 1190 707 1215 696 1240 681 1265 664 1290 649 1315 638 1340 625 1365 612 1390 603 1415 600 1440 590V900Z";
const NEAR =
  "M830 900 849 889 868 881 887 870 906 857 925 848 944 840 963 835 982 834 1002 829 1021 826 1040 822 1059 819 1078 815 1097 808 1116 806 1135 804 1154 798 1173 795 1192 793 1211 789 1230 790 1249 793 1268 788 1288 784 1307 773 1326 765 1345 757 1364 749 1383 744 1402 736 1421 728 1440 720V900Z";
const FRONT =
  "M1010 900 1023 893 1037 889 1050 885 1064 879 1077 875 1091 868 1104 865 1118 864 1131 857 1144 853 1158 848 1171 843 1185 837 1198 830 1212 825 1225 818 1238 820 1252 821 1265 820 1279 819 1292 817 1306 815 1319 812 1332 810 1346 812 1359 816 1373 817 1386 819 1400 823 1413 824 1427 828 1440 830V900Z";
const FAR = `${FAR_EDGE}V900Z`;

/**
 * Decorative hero background: layered graphite-to-ink ridges with a terracotta glow along
 * the far ridge and static film grain. Absolutely positioned to fill its (relative) parent,
 * so it never shifts layout. Keeps the ridge in view at any width (xMaxYMax slice).
 */
export function HeroArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;

  return (
    <div aria-hidden="true" className={[styles.hero, className].filter(Boolean).join(" ")}>
      <svg
        className={styles.heroSvg}
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMaxYMax slice"
        focusable="false"
      >
        <defs>
          <radialGradient
            id={`${id}-glow`}
            cx="1260"
            cy="500"
            r="460"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" className={styles.terracotta} stopOpacity="0.42" />
            <stop offset="0.45" className={styles.terracotta} stopOpacity="0.14" />
            <stop offset="1" className={styles.terracotta} stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id={`${id}-edge`}
            x1="520"
            y1="0"
            x2="1440"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" className={styles.terracotta} stopOpacity="0" />
            <stop offset="0.55" className={styles.terracotta} stopOpacity="0.75" />
            <stop offset="1" className={styles.terracotta} stopOpacity="0.35" />
          </linearGradient>
          <linearGradient
            id={`${id}-far`}
            x1="0"
            y1="450"
            x2="0"
            y2="900"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" className={styles.graphiteLight} />
            <stop offset="1" className={styles.ink0} />
          </linearGradient>
          <linearGradient
            id={`${id}-mid`}
            x1="0"
            y1="600"
            x2="0"
            y2="900"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" className={styles.graphiteDark} />
            <stop offset="1" className={styles.ink0} />
          </linearGradient>
          <filter id={`${id}-soft`} x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              stitchTiles="stitch"
            />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
          </filter>
        </defs>

        <g className={styles.glow}>
          <rect x="200" y="0" width="1600" height="1100" fill={ref("glow")} />
        </g>
        <path d={FAR} fill={ref("far")} className={styles.ridgeFar} />
        <path
          d={FAR_EDGE}
          className={`${styles.edge} ${styles.edgeGlow}`}
          stroke={ref("edge")}
          filter={ref("soft")}
        />
        <path d={FAR_EDGE} className={`${styles.edge} ${styles.edgeLine}`} stroke={ref("edge")} />
        <path d={MID} fill={ref("mid")} />
        <path d={NEAR} className={styles.ridgeNear} />
        <path d={FRONT} className={styles.ridgeFront} />
        <rect width="1440" height="900" filter={ref("grain")} className={styles.grain} />
      </svg>
    </div>
  );
}
