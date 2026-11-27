import { DARK_QUERY, DEFAULT_THEME, THEME_STORAGE_KEY, UNTHEMED_PATH_PREFIX } from "./theme";

/**
 * The inline <head> script that applies the theme before first paint (no
 * flash). Same rules as theme.ts, written as plain ES5 because it runs before
 * any bundle. On /embed it only marks the page, so globals.css keeps the
 * widget panel's own look.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,p=location.pathname,e=${JSON.stringify(
  UNTHEMED_PATH_PREFIX,
)};if(p===e||p.indexOf(e+"/")===0){d.setAttribute("data-surface","embed");return}var c=null;try{c=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(x){}if(c!=="light"&&c!=="dark"&&c!=="system")c=${JSON.stringify(
  DEFAULT_THEME,
)};var t=c==="system"?(window.matchMedia&&matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"dark":"light"):c;d.classList.remove(t==="dark"?"light":"dark");d.classList.add(t);d.style.colorScheme=t}catch(x){}})();`;
