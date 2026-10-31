'use strict';
// Terminal colours for each kind of CIT output. Shared by the VS Code terminal and the CLIs.
const RESET = '\x1b[0m';
const STYLES = {
  error: '\x1b[91m',   // errorln  -> bright red
  warn:  '\x1b[93m',   // warnln   -> bright yellow
  ok:    '\x1b[92m',   // success  -> bright green
  dim:   '\x1b[90m',   // notes    -> grey
  out:   ''            // println  -> terminal default
};
function paint(kind, text, enabled = true) {
  const style = STYLES[kind] || '';
  return enabled && style ? style + text + RESET : text;
}
module.exports = { paint, RESET, STYLES };
