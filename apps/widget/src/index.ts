/**
 * Widget loader entry: `<script src="https://<app>/widget.js" data-key="pk_…">`.
 * `document.currentScript` is only set while this file first runs, so read it now.
 */
import { mount } from "./loader";

void mount(document.currentScript);
