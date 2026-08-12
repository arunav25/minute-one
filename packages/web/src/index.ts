/**
 * @minute-one/web — embeddable SDK.
 *
 * Two inclusion models:
 *   import { init } from "@minute-one/web";      // apps you build
 *   <script src="minute-one.js"></script>        // apps you do not
 *
 * The observer runs in the host page, never in a cross-origin iframe, because
 * it must read the real DOM the user is looking at. The overlay is isolated in
 * Shadow DOM so host styles and guide styles cannot collide.
 */
export * from "./sdk";
export * from "./boot";
export * from "./overlay";
export * from "./spotlight";
export * from "./dom-observer";
export * from "./redaction";
