// Loads the card under test: the page's ?bundle= (a path from this folder),
// or the built card. The prototype and the built card take the same checks.
const bundle = new URLSearchParams(location.search).get("bundle") || "../../dist/svs-subwoofer-card.js";
// The prototype (the card before the rewrite): checks of changes made in the
// rewrite are reported as known differences there, not failures
window.PROTOTYPE = /prototype\.js$/.test(bundle);
document.write(`<script src="${bundle}"><\/script>`);
