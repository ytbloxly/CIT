// CIT core: comment stripping, block-aware linter and an async interpreter.
'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage(); // the task instance that is currently running

const KNOWN_ERRORS = ['NoErr', 'Err', 'ErrUnknown', 'ErrParsedLine', 'ErrExample', 'ValueError'];
const KNOWN_MODULES = ['ui', 'ui-style', 'math'];
const UI_ELEMENTS = ['button', 'p', 'h1', 'h2', 'h3', 'input', 'codeOutput'];
const OPENERS = ['main', 'if', 'for', 'while', 'func', 'class', 'uiroot', 'funcarg', 'task', 'when', 'enum', 'raise', 'uistyle', 'srule', 'switch', 'swcase', 'swdefault', 'try'];
const BLOCK_PREFIX = /^(if|else|for|func|while|class|when|raise|task|switch|case|try|catch|except|finally)\b(?!\.)/;
const IDENT = /^[A-Za-z_]\w*$/;
const TARGET = /^[A-Za-z_]\w*(?:\s*&&\s*[A-Za-z_]\w*)*\.[A-Za-z_]\w*$/;
const WORD_OPS = { and: '&&', or: '||', not: '!' }; // removed from the language: only the symbols exist

function stripComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '#') return line.slice(0, i);
  }
  return line;
}


// split on a separator that is not inside (), [], {} or a "string"
function splitTopLevel(s, sep = ',') {
  if (s.trim() === '') return [];
  const out = [];
  let depth = 0, inStr = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === '\\') cur += s[++i] || '';
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// ---------------------------------------------------------------- ui.style engine
class StyleError extends Error { constructor(msg, severity = 'error') { super(msg); this.severity = severity; } }

const CSS_COLORS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent').split(' '));
const WEB_FONTS = ['Arial', 'Arial Black', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Times New Roman', 'Georgia', 'Garamond', 'Courier New', 'Brush Script MT', 'Helvetica', 'Impact', 'Lucida Console', 'Palatino', 'Comic Sans MS'];
const GENERIC_FONTS = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
const BORDER_TYPES = ['solid', 'dashed', 'double', 'groove', 'dotted', 'ridge', 'inset', 'outset', 'none', 'hidden'];
const SIZE_UNITS = { px: 'px', per: '%', vh: 'vh', vw: 'vw', pt: 'pt', em: 'em', rem: 'rem', cm: 'cm', in: 'in' };
const COLOR_FNS = ['rgb', 'rgba', 'hsl', 'hwb', 'hex', 'color'];
const DISPLAY_VALUES = ['none', 'inline', 'inline-block', 'grid', 'flex', 'flexbox', 'block'];
const POSITION_VALUES = ['static', 'relative', 'sticky', 'absolute', 'fixed'];
const STYLE_PROPS = {
  'background-color': 'color', 'text-color': 'color', 'border-color': 'color',
  'border-type': 'type', 'border-size': 'size', 'border': 'border',
  'font-size': 'size', 'font-family': 'font', 'width': 'size', 'height': 'size',
  'display': 'display', 'margin': 'sizes', 'padding': 'sizes', 'border-corner': 'sizes',
  'position': 'position', 'transform': 'transform'
};
const CSS_NAME = { 'text-color': 'color', 'border-type': 'border-style', 'border-size': 'border-width', 'border-corner': 'border-radius' };

function parseStyleArg(a) {
  a = a.trim();
  let q;
  if (/^-?\d+(\.\d+)?$/.test(a)) return parseFloat(a);
  if ((q = /^"((?:[^"\\]|\\.)*)"$/.exec(a))) return q[1];
  if ((q = /^([a-z]+)\((.*)\)$/.exec(a))) return { fn: q[1], args: splitTopLevel(q[2]).map(parseStyleArg) }; // nested, e.g. translate(px(10), px(5))
  throw new StyleError(`Invalid argument \`${a}\`.`);
}

function parseStyleItems(text) {
  const items = [];
  for (const raw of splitTopLevel(text)) {
    const t = raw.trim();
    if (!t) throw new StyleError('Empty value in the list.');
    let m;
    if ((m = /^([a-z]+)\((.*)\)$/.exec(t))) items.push({ fn: m[1], args: splitTopLevel(m[2]).map(parseStyleArg) });
    else if ((m = /^"((?:[^"\\]|\\.)*)"$/.exec(t))) items.push({ str: m[1] });
    else if (/^-?\d+(\.\d+)?$/.test(t)) items.push({ num: parseFloat(t) });
    else if (/^[A-Za-z][\w-]*$/.test(t)) items.push({ kw: t });
    else throw new StyleError(`Invalid style value \`${t}\`.`);
  }
  return items;
}

function transformCss(it) {
  const a = it.args;
  const nums = (min, max, what) => {
    if (a.length < min || a.length > max || a.some(v => typeof v !== 'number')) throw new StyleError(`${it.fn}() needs ${min === max ? min : min + ' or ' + max} number(s)${what ? ' (' + what + ')' : ''}.`);
  };
  switch (it.fn) {
    case 'translate':
      if (a.length < 1 || a.length > 2 || a.some(v => typeof v !== 'object' || !isSizeItem(v))) throw new StyleError('translate() needs 1 or 2 sizes, for example translate(px(10), px(5)).');
      return `translate(${a.map(sizeCss).join(', ')})`;
    case 'scale': nums(1, 2); return `scale(${a.join(', ')})`;
    case 'rotate': nums(1, 1, 'degrees'); return `rotate(${a[0]}deg)`;
    case 'skew': nums(1, 2, 'degrees'); return `skew(${a.map(v => v + 'deg').join(', ')})`;
  }
  throw new StyleError('`transform` takes translate(), scale(), rotate() or skew().');
}

function colorCss(it) {
  if (!it.fn || !COLOR_FNS.includes(it.fn)) throw new StyleError('Expected a color: rgb(), rgba(), hsl(), hwb(), hex() or color("name").');
  const a = it.args;
  const need = n => { if (a.length !== n) throw new StyleError(`${it.fn}() needs ${n} value${n > 1 ? 's' : ''}.`); };
  const num = (v, lo, hi, what) => {
    if (typeof v !== 'number' || v < lo || v > hi) throw new StyleError(`${it.fn}(): ${what} must be a number from ${lo} to ${hi}.`);
    return v;
  };
  switch (it.fn) {
    case 'rgb': need(3); return `rgb(${num(a[0], 0, 255, 'red')}, ${num(a[1], 0, 255, 'green')}, ${num(a[2], 0, 255, 'blue')})`;
    case 'rgba': need(4); return `rgba(${num(a[0], 0, 255, 'red')}, ${num(a[1], 0, 255, 'green')}, ${num(a[2], 0, 255, 'blue')}, ${num(a[3], 0, 1, 'alpha')})`;
    case 'hsl': need(3); return `hsl(${num(a[0], 0, 360, 'hue')}, ${num(a[1], 0, 100, 'saturation')}%, ${num(a[2], 0, 100, 'lightness')}%)`;
    case 'hwb': need(3); return `hwb(${num(a[0], 0, 360, 'hue')} ${num(a[1], 0, 100, 'whiteness')}% ${num(a[2], 0, 100, 'blackness')}%)`;
    case 'hex': {
      need(1);
      const m = /^#?([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(String(a[0]));
      if (!m) throw new StyleError('hex() needs 3, 4, 6 or 8 hex digits, for example hex("ff8800").');
      return '#' + m[1];
    }
    default: { // color
      need(1);
      const n = String(a[0]).toLowerCase();
      if (!CSS_COLORS.has(n)) throw new StyleError(`Unknown color name "${a[0]}".`);
      return n;
    }
  }
}
function sizeCss(it) {
  if (!it.fn || !SIZE_UNITS[it.fn]) throw new StyleError('Expected a size: px(), per(), vh(), vw(), pt(), em(), rem(), cm() or in().');
  if (it.args.length !== 1 || typeof it.args[0] !== 'number' || it.args[0] < 0) throw new StyleError(`${it.fn}() needs one number (0 or more).`);
  return it.args[0] + SIZE_UNITS[it.fn];
}
const isColorItem = it => !!it.fn && COLOR_FNS.includes(it.fn);
const isSizeItem = it => !!it.fn && !!SIZE_UNITS[it.fn];
const isTypeItem = it => !!it.kw && BORDER_TYPES.includes(it.kw);

// "background-color", 'color("blue")' -> { css: 'background-color: blue', warning }
function compileStyleProp(prop, valueText) {
  const kind = STYLE_PROPS[prop];
  if (!kind) throw new StyleError(`Unknown style property \`${prop}\`. Known: ${Object.keys(STYLE_PROPS).join(', ')}.`);
  const items = parseStyleItems(valueText);
  const one = () => {
    if (items.length !== 1) throw new StyleError(`\`${prop}\` takes exactly one value.`);
    return items[0];
  };
  let warning = null, value;
  switch (kind) {
    case 'color': value = colorCss(one()); break;
    case 'size': value = sizeCss(one()); break;
    case 'type': {
      const it = one();
      if (!isTypeItem(it)) throw new StyleError(`Border type must be one of: ${BORDER_TYPES.join(', ')}.`);
      value = it.kw; break;
    }
    case 'border': {
      if (items.length > 3) throw new StyleError('`border` takes at most a size, a type and a color.');
      const parts = {};
      for (const it of items) {
        const slot = isSizeItem(it) ? 'size' : isTypeItem(it) ? 'type' : isColorItem(it) ? 'color' : null;
        if (!slot) throw new StyleError('`border` takes a size, a type and a color, for example `border = px(2), solid, color("red");`.');
        if (parts[slot]) throw new StyleError(`\`border\` has two ${slot} values.`);
        parts[slot] = it;
      }
      value = ['size', 'type', 'color'].filter(k => parts[k]).map(k => (k === 'size' ? sizeCss(parts[k]) : k === 'type' ? parts[k].kw : colorCss(parts[k]))).join(' ');
      break;
    }
    case 'sizes': {
      if (items.length < 1 || items.length > 4) throw new StyleError(`\`${prop}\` takes 1 to 4 sizes (like CSS: top, right, bottom, left).`);
      value = items.map(sizeCss).join(' ');
      break;
    }
    case 'display': case 'position': {
      const it = one();
      const allowed = kind === 'display' ? DISPLAY_VALUES : POSITION_VALUES;
      if (!it.kw || !allowed.includes(it.kw)) throw new StyleError(`\`${prop}\` must be one of: ${allowed.join(', ')}.`);
      value = it.kw === 'flexbox' ? 'flex' : it.kw;
      break;
    }
    case 'transform': value = items.map(transformCss).join(' '); break;
    default: { // font
      value = items.map(it => {
        if (it.str !== undefined) {
          if (!/^[A-Za-z0-9 _-]+$/.test(it.str)) throw new StyleError('Font names may only contain letters, digits, spaces, - and _.');
          if (!WEB_FONTS.includes(it.str)) warning = `"${it.str}" is not a web-safe font; add a generic fallback like sans-serif.`;
          return `"${it.str}"`;
        }
        if (it.kw && GENERIC_FONTS.includes(it.kw)) return it.kw;
        throw new StyleError(`Use a "font name" or one of: ${GENERIC_FONTS.join(', ')}.`);
      }).join(', ');
    }
  }
  return { css: `${CSS_NAME[prop] || prop}: ${value}`, warning };
}

const STATE_SUFFIX = { clicked: '.cit-clicked', hover: ':hover', hoverEnd: '.cit-hover-end', active: ':active' };
function compileSelector(sel) {
  sel = sel.trim();
  let suffix = '';
  const sm = /^(.*?)\.(clicked|hover|hoverEnd|active)\(\)$/.exec(sel);
  if (sm) { sel = sm[1]; suffix = STATE_SUFFIX[sm[2]]; }
  if (sel === 'uni') return '#cit-app *' + suffix;
  const [kind, name] = sel.split('.');
  if (kind === 'id') return `#cit-app #${name}${suffix}`;
  if (kind === 'class') return `#cit-app .${name}${suffix}`;
  if (kind === 'name') return `#cit-app [data-name="${name}"]${suffix}`;
  return (name === 'codeOutput' ? '#cit-app .cit-code-output' : `#cit-app ${name}`) + suffix; // ui.<element>
}
// sheet = { rules: [{ selectors: [..], props: [{ prop, value }] }] }
function compileSheet(sheet) {
  return sheet.rules.map(r => {
    const body = r.props.map(p => compileStyleProp(p.prop, p.value).css + ';').join(' ');
    return `${r.selectors.map(compileSelector).join(', ')} { ${body} }`;
  }).join('\n');
}

// ---------------------------------------------------------------- line classification
const RE = {
  main: /^void\s+main\s*\(\s*\)$/,
  if: /^if\s*\((.*)\)\s*do$/,
  elseif: /^else\s+if\s*\((.*)\)\s*do$/,
  else: /^else\s+do$/,
  while: /^while\s*\((.*)\)\s*do$/,
  for: /^for\s*\(\s*default\s+num\s+([A-Za-z_]\w*)\s*,\s*range\s*=\s*(.+?)\s*,\s*(.+?)\s*\)\s*do$/,
  func: /^func\s+([A-Za-z_]\w*)\s*\((.*)\)\s*do$/,
  class: /^class\s+([A-Za-z_]\w*)\s*\(\s*([A-Za-z_]\w*)?\s*\)\s*do$/,
  end: /^end\s*;$/,
  endcall: /^end\s*\)\s*;$/,
  ret: /^return\s+error\.([A-Za-z_]\w*)\s*;$/,
  import: /^import\s+([A-Za-z_][\w-]*)(?:\s+as\s+([A-Za-z_]\w*))?\s*(;?)$/,
  uiroot: /^ui\.root\s+([A-Za-z_]\w*)\s*\((.*)\)$/,
  uielem: /^ui\s+([A-Za-z_]\w*)\s*->\s*ui\.([A-Za-z0-9]+)\s*\((.*)\)\s*=\s*(.+);$/,
  funcarg: /^(.+?)\(\s*func\s+([A-Za-z_]\w*)\s*\((.*)\)\s*$/,
  task: /^task\s+([A-Za-z_]\w*)\s*\((.*)\)\s*do$/,
  when: /^when\s*\((.*)\)\s*do$/,
  whencase: /^(?:\((.*?)\)|(else))\s*(?:>>|is\b)\s*(.+);$/,
  enum: /^(default|global|const)\s+enum\s+([A-Za-z_]\w*)\s+do$/,
  enummember: /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*;$/,
  raise: /^raise\s+error\.([A-Za-z_]\w*)\s+do$/,
  raisestmt: /^raise\s+error\.([A-Za-z_]\w*)\s*;$/,
  simple: /^(break|continue|pass)\s*;$/,
  retval: /^return(?:\s+(.+?))?\s*;$/,
  switch: /^switch\s*\((.*)\)\s*do$/,
  swcase: /^case\s+(.+?)\s+do$/,
  swdefault: /^default\s+do$/,
  try: /^try\s+do$/,
  catch: /^(catch|except)\s*(?:\(\s*([A-Za-z_]\w*)\s*\))?\s*do$/,
  finally: /^finally\s+do$/,
  uistyle: /^ui\.style\s+([A-Za-z_]\w*)\s*\(\s*\)$/,
  sclose: /^\}\s*;$/
};
const SEL = '(?:(?:id|name|class)\\.[A-Za-z_][\\w-]*|ui\\.[A-Za-z0-9]+|uni)(?:\\.(?:clicked|hover|hoverEnd|active)\\(\\))?';
const SELS = `${SEL}(?:\\s*,\\s*${SEL})*`;
RE.srule = new RegExp(`^(${SELS})\\s*\\{$`);
RE.sruleline = new RegExp(`^(${SELS})\\s*\\{(.*)\\}\\s*;$`);

function splitParams(s) { // -> [{ name, def }] or null; def is the default value text (or null)
  const out = [];
  for (const part of splitTopLevel(s)) {
    const m = /^\s*([A-Za-z_]\w*)\s*(?:=\s*([\s\S]+?))?\s*$/.exec(part);
    if (!m) return null;
    out.push({ name: m[1], def: m[2] !== undefined ? m[2] : null });
  }
  return out;
}

function classify(t) {
  let m;
  if (RE.main.test(t)) return { k: 'main' };
  if ((m = RE.whencase.exec(t))) return { k: 'whencase', cond: m[1] !== undefined ? m[1] : null, rhs: m[3] };
  if ((m = RE.if.exec(t))) return { k: 'if', cond: m[1] };
  if ((m = RE.elseif.exec(t))) return { k: 'elseif', cond: m[1] };
  if (RE.else.test(t)) return { k: 'else' };
  if ((m = RE.while.exec(t))) return { k: 'while', cond: m[1] };
  if ((m = RE.for.exec(t))) return { k: 'for', v: m[1], from: m[2], to: m[3] };
  if ((m = RE.func.exec(t))) {
    const params = splitParams(m[2]);
    return params ? { k: 'func', name: m[1], params } : { k: 'badblock' };
  }
  if ((m = RE.class.exec(t))) return { k: 'class', name: m[1], parent: m[2] || null };
  if ((m = RE.task.exec(t))) {
    const params = splitParams(m[2]);
    return params ? { k: 'task', name: m[1], params } : { k: 'badblock' };
  }
  if ((m = RE.when.exec(t))) return { k: 'when', cond: m[1] };
  if ((m = RE.switch.exec(t))) return { k: 'switch', subject: m[1] };
  if ((m = RE.swcase.exec(t))) return { k: 'swcase', values: m[1] };
  if (RE.swdefault.test(t)) return { k: 'swdefault' };
  if (RE.try.test(t)) return { k: 'try' };
  if ((m = RE.catch.exec(t))) return { k: 'catch', kw: m[1], v: m[2] || null };
  if (RE.finally.test(t)) return { k: 'finally' };
  if ((m = RE.uistyle.exec(t))) return { k: 'uistyle', name: m[1] };
  if ((m = RE.srule.exec(t))) return { k: 'srule', selectors: m[1] };
  if ((m = RE.sruleline.exec(t))) return { k: 'sruleline', selectors: m[1], body: m[2] };
  if (RE.sclose.test(t)) return { k: 'sclose' };
  if ((m = RE.enum.exec(t))) return { k: 'enum', mod: m[1], name: m[2] };
  if (RE.end.test(t)) return { k: 'end' };
  if (RE.endcall.test(t)) return { k: 'endcall' };
  if ((m = RE.ret.exec(t))) return { k: 'return', name: m[1] };
  if ((m = RE.simple.exec(t))) return { k: m[1] };
  if ((m = RE.retval.exec(t))) return { k: 'retval', expr: m[1] || null };
  if ((m = RE.raise.exec(t))) return { k: 'raise', name: m[1] };
  if ((m = RE.raisestmt.exec(t))) return { k: 'raisestmt', name: m[1] };
  if ((m = RE.import.exec(t))) return { k: 'import', name: m[1], alias: m[2] || null, semi: m[3] === ';' };
  if ((m = RE.uiroot.exec(t))) return { k: 'uiroot', name: m[1], attrs: m[2] };
  if ((m = RE.uielem.exec(t))) return { k: 'uielem', name: m[1], el: m[2], attrs: m[3], text: m[4] };
  if ((m = RE.funcarg.exec(t))) {
    const params = splitParams(m[3]);
    if (params && TARGET.test(m[1].trim())) return { k: 'funcarg', target: m[1].trim(), name: m[2], params };
    return { k: 'badblock' };
  }
  if (/\(\s*func\b/.test(t)) return { k: 'badblock' };
  if (/^ui\s+[A-Za-z_]\w*\s*->/.test(t)) return { k: 'badblock' };
  if (/^ui\.(root|style)\b/.test(t)) return { k: 'badblock' };
  if (BLOCK_PREFIX.test(t)) return { k: 'badblock' };
  if ((m = RE.enummember.exec(t))) return { k: 'enummember', enumName: m[1], member: m[2] };
  return { k: 'stmt' };
}

function badBlockMessage(t) {
  if (/\(\s*func\b/.test(t)) return 'Invalid callback. Use: `element.clicked(func name()` ... closed by `end);`.';
  if (/^ui\.root\b/.test(t)) return 'Invalid `ui.root`. Use: `ui.root name(title="My App")`.';
  if (/^ui\.style\b/.test(t)) return 'Invalid `ui.style`. Use: `ui.style name()`.';
  if (/^ui\s/.test(t)) return 'Invalid UI element. Use: `ui name -> ui.button(id="x") = "text";`.';
  if (/^if\b/.test(t)) return 'Invalid `if`. Use: `if (condition) do`.';
  if (/^else\b/.test(t)) return 'Invalid `else`. Use: `else do` or `else if (condition) do`.';
  if (/^while\b/.test(t)) return 'Invalid `while`. Use: `while (condition) do`.';
  if (/^for\b/.test(t)) return 'Invalid `for`. Use: `for (default num i, range = 0, 12) do`.';
  if (/^class\b/.test(t)) return 'Invalid `class`. Use: `class Name() do` or `class Child(Parent) do`.';
  if (/^task\b/.test(t)) return 'Invalid `task`. Use: `task name() do`.';
  if (/^switch\b/.test(t)) return 'Invalid `switch`. Use: `switch (value) do`.';
  if (/^case\b/.test(t)) return 'Invalid `case`. Use: `case value do` (inside a switch).';
  if (/^try\b/.test(t)) return 'Invalid `try`. Use: `try do`.';
  if (/^(catch|except)\b/.test(t)) return 'Invalid `catch`/`except`. Use: `catch (err) do` or `except (err) do`.';
  if (/^finally\b/.test(t)) return 'Invalid `finally`. Use: `finally do`.';
  if (/^when\b/.test(t)) return 'Invalid `when`. Use: `when (value) do`.';
  if (/^raise\b/.test(t)) return 'Invalid `raise`. Use: `raise error.Name;` or `raise error.Name do ... end;`.';
  return 'Invalid `func`. Use: `func name(a, b) do`.';
}

// ---------------------------------------------------------------- linter
// Returns [{line, start, end, message, severity}] (line is 0-based)
function lint(text) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  const add = (line, start, end, message, severity = 'error') =>
    problems.push({ line, start, end, message, severity });
  const stack = [];
  const classes = [];
  const tasks = [];
  const imports = new Set();
  const styleSheets = [];
  const styleConnects = [];
  let firstUiRoot = null;
  let firstMathUse = null;
  let seenMain = false, seenUiRoot = false, lastKind = null, lastLine = -1, firstTop = null;
  const FRAME = { main: '`void main()`', class: '`class`', uiroot: '`ui.root`', funcarg: 'callback' };
  const nameOf = k => FRAME[k] || '`' + k + '`';
  const inLoop = () => {
    for (let k = stack.length - 1; k >= 0; k--) {
      const f = stack[k].k;
      if (f === 'for' || f === 'while' || f === 'task') return true;
      if (['func', 'funcarg', 'class', 'main', 'uiroot'].includes(f)) return false;
    }
    return false;
  };
  const inSwitch = () => {
    for (let k = stack.length - 1; k >= 0; k--) {
      const f = stack[k].k;
      if (f === 'swcase' || f === 'swdefault') return true;
      if (['func', 'funcarg', 'class', 'main', 'uiroot'].includes(f)) return false;
    }
    return false;
  };
  const inFunc = () => {
    for (let k = stack.length - 1; k >= 0; k--) {
      const f = stack[k].k;
      if (f === 'func' || f === 'funcarg' || f === 'task') return true;
      if (['main', 'class', 'uiroot'].includes(f)) return false;
    }
    return false;
  };

  lines.forEach((raw, i) => {
    const code = stripComment(raw);
    const t = code.trim();
    if (!t) return;
    const start = code.length - code.trimStart().length;
    const end = start + t.length;
    const c = classify(t);
    lastKind = c.k; lastLine = i;
    const top = stack.length ? stack[stack.length - 1] : null;
    const here = (msg, sev) => add(i, start, end, msg, sev);
    const noSemi = () => add(i, Math.max(start, end - 1), end, 'Missing semicolon `;` at the end of the statement.');
    const frame = (k, extra) => stack.push(Object.assign({ k, line: i, start, end, hasElse: false }, extra));
    const direct = kind => {
      if (!top) { here(kind === 'func' ? 'Functions must be inside `void main()` or a class.' : 'Code must be inside `void main()`.'); return; }
      if (top.k === 'class' && kind !== 'func') here('Only `func` can be declared directly inside a class.');
      else if (top.k === 'uiroot') here('Only `ui name -> ui.element(...) = "text";` lines belong inside `ui.root`.');
      else if (top.k === 'enum') here('Only `' + top.name + '.Member;` lines belong inside an enum.');
      else if (top.k === 'uistyle') here('Only style rules like `class.button { ... };` belong inside `ui.style`.');
      else if (top.k === 'srule') here('Only `property = value;` lines belong inside a style rule.');
      else if (top.k === 'switch' && kind !== 'swcase') here('Only `case ... do` and `default do` blocks belong directly inside a switch.');
    };
    const checkSelectors = (list) => {
      for (const sel of splitTopLevel(list)) {
        const m = /^\s*ui\.([A-Za-z0-9]+)(?:\.\w+\(\))?\s*$/.exec(sel);
        if (m && !UI_ELEMENTS.includes(m[1])) here(`Unknown UI element \`ui.${m[1]}\` in a style selector. Use: ${UI_ELEMENTS.join(', ')}.`);
      }
    };
    const checkProp = (text) => { // `property = value;`
      const pm = /^([A-Za-z][\w-]*)\s*=\s*(.+);$/.exec(text.trim());
      if (!pm) { here('A style property looks like `background-color = color("blue");`.'); return; }
      try {
        const res = compileStyleProp(pm[1], pm[2]);
        if (res.warning) here(res.warning, 'warning');
      } catch (e) {
        if (!(e instanceof StyleError)) throw e;
        here(e.message, e.severity);
      }
    };
    // checks for break / continue / return value
    const simple = kind => {
      if (kind === 'continue' && !inLoop()) here('`continue` can only be used inside a `for`, `while` or `task` body.');
      if (kind === 'break' && !inLoop() && !inSwitch()) here('`break` can only be used inside a `for`, `while`, `task` or `switch`.');
      if (kind === 'retval' && !inFunc()) here('`return` can only be used inside a `func` or `task`. (Use `return error.NoErr;` to end the program.)');
    };
    if (!firstMathUse && /(^|[^\w.])math\./.test(t.replace(/"(?:[^"\\]|\\.)*"/g, '""'))) firstMathUse = { line: i, start, end };
    if (!top && !['return', 'main', 'end', 'endcall'].includes(c.k) && !firstTop) firstTop = { k: c.k, line: i, start, end };

    switch (c.k) {
      case 'main':
        if (top) here('`void main()` cannot be nested.');
        else if (seenMain) here('Duplicate `void main()`.');
        seenMain = true; frame('main'); return;
      case 'class':
        if (top) here('Classes must be declared at the top level, outside `void main()`.');
        else if (classes.some(x => x.name === c.name)) here(`Class \`${c.name}\` is already declared.`);
        classes.push({ name: c.name, parent: c.parent, line: i, start, end });
        frame('class'); return;
      case 'task':
        if (top) here('Tasks must be declared at the top level, outside `void main()`.');
        else if (tasks.includes(c.name)) here(`Task \`${c.name}\` is already declared.`);
        tasks.push(c.name);
        frame('task'); return;
      case 'uiroot':
        if (top) here('`ui.root` must be at the top level.');
        else if (seenUiRoot) here('Only one `ui.root` is allowed.');
        seenUiRoot = true;
        if (!firstUiRoot) firstUiRoot = { line: i, start, end };
        { const sm = /style-connect\s*=\s*"([^"]*)"/.exec(c.attrs); if (sm) styleConnects.push({ name: sm[1].replace(/\s*\(\s*\)\s*$/, '').trim(), line: i, start, end }); }
        frame('uiroot'); return;
      case 'uistyle':
        if (top) here('`ui.style` must be at the top level.');
        else if (styleSheets.some(x => x.name === c.name)) here(`Style sheet \`${c.name}\` is already declared.`);
        styleSheets.push({ name: c.name, line: i, start, end });
        frame('uistyle'); return;
      case 'srule':
        if (!top || top.k !== 'uistyle') here('Style rules belong directly inside `ui.style`.');
        else checkSelectors(c.selectors);
        frame('srule'); return;
      case 'sruleline':
        if (!top || top.k !== 'uistyle') here('Style rules belong directly inside `ui.style`.');
        else {
          checkSelectors(c.selectors);
          for (const p of splitTopLevel(c.body, ';')) if (p.trim()) checkProp(p.trim() + ';');
        }
        return;
      case 'sclose':
        if (!top || top.k !== 'srule') here('Unexpected `};` - it only closes a style rule.');
        else stack.pop();
        return;
      case 'switch':
        direct('switch'); frame('switch', { hasDefault: false }); return;
      case 'swcase': case 'swdefault':
        if (!top || top.k !== 'switch') here('`case` / `default` belong directly inside a `switch (...) do` block.');
        else if (c.k === 'swdefault') {
          if (top.hasDefault) here('A switch can only have one `default do` block.');
          top.hasDefault = true;
        }
        frame(c.k); return;
      case 'try':
        direct('try'); frame('try', { hasCatch: false, hasFinally: false }); return;
      case 'catch':
        if (!top || top.k !== 'try') here('`' + c.kw + '` without a matching `try`.');
        else if (top.hasCatch) here('A `try` can only have one `catch` / `except` block.');
        else if (top.hasFinally) here('`' + c.kw + '` must come before `finally`.');
        else top.hasCatch = true;
        return;
      case 'finally':
        if (!top || top.k !== 'try') here('`finally` without a matching `try`.');
        else if (top.hasFinally) here('A `try` can only have one `finally` block.');
        else top.hasFinally = true;
        return;
      case 'import':
        if (top) here('`import` must be at the top level.');
        else imports.add(c.name);
        if (top) { /* error already reported */ }
        else if (!KNOWN_MODULES.includes(c.name)) here(`Unknown module \`${c.name}\`. Known: ${KNOWN_MODULES.join(', ')}.`, 'warning');
        if (!c.semi) noSemi();
        return;
      case 'uielem':
        if (!top || top.k !== 'uiroot') here('UI elements must be declared inside `ui.root`.');
        else if (!UI_ELEMENTS.includes(c.el)) here(`Unknown UI element \`ui.${c.el}\`. Use: ${UI_ELEMENTS.join(', ')}.`);
        return;
      case 'if': case 'for': case 'while': case 'func': case 'funcarg': case 'when': case 'raise':
        direct(c.k); frame(c.k); return;
      case 'enum':
        direct('enum'); frame('enum', { name: c.name, members: new Set() }); return;
      case 'enummember':
        if (!top || top.k !== 'enum') here('`' + t.replace(/;$/, '') + ';` is only valid inside a `default enum Name do ... end;` block.');
        else if (c.enumName !== top.name) here('Write enum members as `' + top.name + '.Member;`.');
        else if (top.members.has(c.member)) here(`Duplicate enum member \`${c.member}\`.`);
        else top.members.add(c.member);
        return;
      case 'whencase': {
        if (!top || top.k !== 'when') here('`is` cases belong inside a `when (...) do` block.');
        const rc = classify(c.rhs + ';');
        if (!['stmt', 'break', 'continue', 'pass', 'retval', 'return', 'raisestmt'].includes(rc.k)) here('An `is` case takes a single statement.');
        else simple(rc.k);
        return;
      }
      case 'elseif': case 'else':
        if (!top || top.k !== 'if') here('`' + (c.k === 'else' ? 'else' : 'else if') + '` without a matching `if`.');
        else if (top.hasElse) here('Nothing can follow `else` in the same if-chain.');
        else if (c.k === 'else') top.hasElse = true;
        return;
      case 'end':
        if (!top) here('Unexpected `end;` - there is no open block.');
        else {
          if (top.k === 'funcarg') here('Close this callback with `end);` instead of `end;`.');
          if (top.k === 'srule') here('Close a style rule with `};` instead of `end;`.');
          if (top.k === 'try' && !top.hasCatch && !top.hasFinally) add(top.line, top.start, top.end, 'A `try` needs a `catch` / `except` block or a `finally` block.');
          stack.pop();
        }
        return;
      case 'endcall':
        if (!top) here('Unexpected `end);` - there is no open block.');
        else {
          if (top.k !== 'funcarg') here('`end);` only closes a `...(func name()` callback. Use `end;` here.');
          stack.pop();
        }
        return;
      case 'badblock': {
        here(badBlockMessage(t));
        let k = null;
        if (/\(\s*func\b/.test(t)) k = 'funcarg';
        else if (/^ui\.root\b/.test(t)) k = 'uiroot';
        else if (/^ui\.style\b/.test(t)) k = 'uistyle';
        else {
          const mm = /^(if|for|while|func|class|when|raise|task|switch|case|try)\b(?!\.)/.exec(t);
          if (mm) k = mm[1] === 'case' ? 'swcase' : mm[1];
        }
        if (k) frame(k); // keep end; balanced
        return;
      }
      case 'return':
        if (!KNOWN_ERRORS.includes(c.name)) {
          here('Unknown error type `error.' + c.name + '`. Known: ' + KNOWN_ERRORS.map(e => 'error.' + e).join(', ') + '.', 'warning');
        }
        return;
      case 'break': case 'continue': case 'pass': case 'retval':
        direct('stmt'); simple(c.k); return;
      case 'raisestmt':
        direct('stmt'); return;
      default: // plain statement
        if (top && top.k === 'srule') { checkProp(t); return; } // style property
        direct('stmt');
        if (!t.endsWith(';')) noSemi();
    }
  });

  stack.forEach(f => add(f.line, f.start, f.end,
    'This ' + nameOf(f.k) + ' block is never closed with `' + (f.k === 'funcarg' ? 'end);' : 'end;') + '`.'));
  classes.forEach(cl => {
    if (!cl.parent) return;
    if (cl.parent === cl.name) add(cl.line, cl.start, cl.end, 'A class cannot inherit from itself.');
    else if (!classes.some(x => x.name === cl.parent)) add(cl.line, cl.start, cl.end, `Unknown parent class \`${cl.parent}\`.`);
  });
  styleConnects.forEach(sc => {
    if (!styleSheets.some(x => x.name === sc.name)) add(sc.line, sc.start, sc.end, `Unknown style sheet \`${sc.name}\`. Declare it with \`ui.style ${sc.name}()\`.`);
  });
  if ((styleSheets.length || styleConnects.length) && !imports.has('ui-style')) {
    const f = styleSheets[0] || styleConnects[0];
    add(f.line, f.start, f.end, 'Add `import ui-style;` to use `ui.style`.', 'warning');
  }
  if (firstMathUse && !imports.has('math')) add(firstMathUse.line, firstMathUse.start, firstMathUse.end, 'Add `import math;` (or `import math as m;`) to use the math module.', 'warning');
  if (firstUiRoot && !imports.has('ui')) add(firstUiRoot.line, firstUiRoot.start, firstUiRoot.end, 'Add `import ui;` to use the ui module.', 'warning');
  if (!seenMain && firstTop && ['class', 'uiroot', 'import', 'task', 'uistyle'].includes(firstTop.k)) {
    add(firstTop.line, firstTop.start, firstTop.end, 'Every CIT program needs a `void main()`.');
  }
  if (seenMain && !stack.length && lastKind !== 'return') {
    add(lastLine, 0, Math.max(1, lines[lastLine].length), 'Missing `return error.NoErr;` at the end of the program.');
  }
  return problems;
}

// What should be auto-inserted after pressing Enter on line `lineNo`? 'end;' | 'end);' | null
function closerFor(text, lineNo) {
  const lines = text.split(/\r?\n/);
  const c = classify(stripComment(lines[lineNo] || '').trim());
  if (!OPENERS.includes(c.k)) return null;
  let opens = 0, ends = 0;
  for (const l of lines) {
    const k = classify(stripComment(l).trim()).k;
    if (OPENERS.includes(k)) opens++;
    else if (k === 'end' || k === 'endcall' || k === 'sclose') ends++;
  }
  return opens > ends ? (c.k === 'funcarg' ? 'end);' : c.k === 'srule' ? '};' : 'end;') : null;
}
const needsEnd = (text, lineNo) => closerFor(text, lineNo) !== null;

// ---------------------------------------------------------------- values
class CitError extends Error {
  constructor(msg, line, kind) { super(msg); this.citLine = line; this.kind = kind; }
}
class ExitSignal { constructor(name) { this.name = name; } }
class Instance { constructor(cls) { this.cls = cls; this.attrs = new Map(); } }
class CitList { constructor(items, tuple) { this.items = items; this.tuple = tuple; } }
class CitDict { constructor(map) { this.map = map; } }
class CitSet {
  constructor() { this.map = new Map(); } // key -> value, keeps insertion order
  add(v) { this.map.set(keyOf(v), v); }
  has(v) { return this.map.has(keyOf(v)); }
  delete(v) { return this.map.delete(keyOf(v)); }
  values() { return [...this.map.values()]; }
}
class Pair { constructor(left, right) { this.left = left; this.right = right; } } // "a" => "b"
class Module { constructor(name) { this.name = name; } }
let idCounter = 0;
const objectIds = new WeakMap();
function keyOf(v) { // what makes two set items "the same"
  if (v === null) return 'n';
  switch (typeof v) {
    case 'number': return 'd' + v;
    case 'boolean': return 'b' + v;
    case 'string': return 's' + JSON.stringify(v);
  }
  if (v instanceof CitList) {
    if (!v.tuple) throw new CitError('A list cannot be an item of a set (it can change). Use a tuple instead.');
    return 't(' + v.items.map(keyOf).join(',') + ')';
  }
  if (v instanceof CitDict || v instanceof CitSet) throw new CitError(`A ${v instanceof CitSet ? 'set' : 'dictionary'} cannot be an item of a set.`);
  if (!objectIds.has(v)) objectIds.set(v, ++idCounter);
  return 'o' + objectIds.get(v);
}
class EnumType {
  constructor(name, members) {
    this.name = name; this.members = members;
    this.values = members.map((m, i) => new EnumValue(this, m, i));
  }
}
class EnumValue { constructor(type, name, index) { this.type = type; this.name = name; this.index = index; } }
class BreakSignal {}
class ContinueSignal {}
class ReturnSignal { constructor(value) { this.value = value; } }
class RaiseSignal { constructor(name, line) { this.name = name; this.line = line; } }
class TaskStop {}
class ErrorValue { constructor(name, message, line) { this.name = name; this.message = message; this.line = line; } }
const SKIP = Symbol('skip'); // an argument that says: use the parameter's default
class UiElement {
  constructor(name, kind, attrs, text) {
    this.name = name; this.kind = kind; this.attrs = attrs; this.text = text;
    this.handlers = { clicked: [], focus: [], focusEnd: [], typed: [], hover: [], hoverEnd: [], active: [] };
    this.value = ''; // what the user typed into an input
    this.log = [];      // codeOutput lines
  }
}
class UiRoot {
  constructor(name, title, attrs) {
    this.name = name; this.title = title; this.attrs = attrs;
    this.elements = []; this.handlers = { closed: [] }; this.css = '';
  }
}

// ---------------------------------------------------------------- expression parser
function tokenize(src) {
  const re = /\s*(?:(\d+(?:\.\d+)?)|(f"(?:[^"\\]|\\.)*")|("(?:[^"\\]|\\.)*")|([A-Za-z_]\w*)|(==|!=|<=|>=|=>|&&|\|\||[-+*\/%()<>!,.\[\]{}:|&^]))/y;
  const s = src.trimEnd();
  const toks = [];
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) throw new CitError(`Unexpected '${s.slice(pos).trim()[0]}' in expression.`);
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push({ t: 'num', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) toks.push({ t: 'fstr', v: m[2].slice(2, -1) });
    else if (m[3] !== undefined) toks.push({ t: 'str', v: m[3].slice(1, -1) });
    else if (m[4] !== undefined) toks.push({ t: 'id', v: m[4] });
    else toks.push({ t: 'op', v: m[5] });
  }
  return toks;
}

const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['|'], ['^'], ['&'], ['+', '-'], ['*', '/', '%']];

function parseExpr(src) {
  const toks = tokenize(src);
  let p = 0;
  const isOp = v => toks[p] && toks[p].t === 'op' && toks[p].v === v;
  const expect = v => { if (!isOp(v)) throw new CitError(`Expected '${v}' in expression.`); p++; };

  function level(l) {
    if (l === LEVELS.length) return unary();
    let left = level(l + 1);
    while (toks[p] && toks[p].t === 'op' && LEVELS[l].includes(toks[p].v)) {
      const op = toks[p++].v;
      left = { type: 'bin', op, left, right: level(l + 1) };
    }
    return left;
  }
  function unary() {
    if (isOp('!')) { p++; return { type: 'not', e: unary() }; }
    if (isOp('-')) { p++; return { type: 'neg', e: unary() }; }
    return postfix();
  }
  function args() {
    expect('(');
    const list = [];
    const one = () => { // an argument; "a" => "b" is a pair (used by replace)
      const left = level(0);
      if (isOp('=>')) { p++; return { type: 'pair', left, right: level(0) }; }
      return left;
    };
    if (!isOp(')')) {
      list.push(one());
      while (isOp(',')) { p++; list.push(one()); }
    }
    expect(')');
    return list;
  }
  function postfix() {
    let node = primary();
    for (;;) {
      if (isOp('.')) {
        p++;
        const prop = toks[p++];
        if (!prop || prop.t !== 'id') throw new CitError("Expected a name after '.'.");
        node = isOp('(')
          ? { type: 'mcall', obj: node, name: prop.v, args: args() }
          : { type: 'member', obj: node, prop: prop.v };
      } else if (isOp('[')) {
        p++;
        const index = level(0);
        expect(']');
        node = { type: 'index', obj: node, index };
      } else break;
    }
    return node;
  }
  function primary() {
    const t = toks[p++];
    if (!t) throw new CitError('Unexpected end of expression.');
    if (t.t === 'num') return { type: 'lit', v: t.v };
    if (t.t === 'str') return { type: 'str', raw: t.v, fmt: false };
    if (t.t === 'fstr') return { type: 'str', raw: t.v, fmt: true };
    if (t.t === 'op' && t.v === '[') { // list literal
      const items = [];
      if (!isOp(']')) {
        items.push(level(0));
        while (isOp(',')) { p++; if (isOp(']')) break; items.push(level(0)); }
      }
      expect(']');
      return { type: 'list', items, tuple: false };
    }
    if (t.t === 'op' && t.v === '{') { // dictionary literal, or a set when the first item has no  key:
      const isDict = isOp('}') || ((toks[p].t === 'id' || toks[p].t === 'str') && toks[p + 1] && toks[p + 1].t === 'op' && toks[p + 1].v === ':');
      if (!isDict) {
        const items = [level(0)];
        while (isOp(',')) { p++; if (isOp('}')) break; items.push(level(0)); }
        expect('}');
        return { type: 'set', items };
      }
      const entries = [];
      while (!isOp('}')) {
        const k = toks[p++];
        if (!k || (k.t !== 'id' && k.t !== 'str')) throw new CitError('A dictionary key must be a name or a "string".');
        expect(':');
        entries.push({ key: k.t === 'str' ? unescape(k.v) : k.v, value: level(0) });
        if (isOp(',')) p++; else break;
      }
      expect('}');
      return { type: 'dict', entries };
    }
    if (t.t === 'op' && t.v === '(') { // grouping or tuple literal
      if (isOp(')')) { p++; return { type: 'list', items: [], tuple: true }; }
      const first = level(0);
      if (isOp(',')) {
        const items = [first];
        while (isOp(',')) { p++; if (isOp(')')) break; items.push(level(0)); }
        expect(')');
        return { type: 'list', items, tuple: true };
      }
      expect(')');
      return first;
    }
    if (t.t === 'id') {
      if (t.v === 'True') return { type: 'lit', v: true };
      if (t.v === 'False') return { type: 'lit', v: false };
      if (t.v === 'Null') return { type: 'lit', v: null };
      if (t.v === 'not') throw new CitError("Use '!' instead of 'not'.");
      if (isOp('(')) return { type: 'call', name: t.v, args: args() };
      return { type: 'var', name: t.v };
    }
    throw new CitError(`Unexpected '${t.v}' in expression.`);
  }

  const e = level(0);
  if (p < toks.length) {
    const t = toks[p];
    if (t.t === 'id' && WORD_OPS[t.v]) throw new CitError(`Use '${WORD_OPS[t.v]}' instead of '${t.v}'.`);
    throw new CitError(`Unexpected '${t.v}' in expression.`);
  }
  return e;
}

// ---------------------------------------------------------------- runtime helpers
class Scope {
  constructor(parent) { this.parent = parent; this.vars = new Map(); this.funcs = new Map(); }
}
function getVar(scope, name) {
  for (let s = scope; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name);
  if (name === 'math') throw new CitError("Unknown variable 'math'. Add `import math;` (or `import math as m;`) to use the math module.");
  throw new CitError(`Unknown variable '${name}'.`);
}
function findFunc(scope, name) {
  for (let s = scope; s; s = s.parent) if (s.funcs.has(name)) return s.funcs.get(name);
  return null;
}
function typeName(v) {
  if (v === null) return 'Null';
  if (v instanceof Instance) return 'classIns';
  if (v instanceof UiElement || v instanceof UiRoot) return 'ui';
  if (v instanceof CitList || v instanceof CitDict || v instanceof CitSet) return 'list';
  if (v instanceof Module) return 'module';
  if (v instanceof EnumType || v instanceof EnumValue) return 'enum';
  if (v instanceof ErrorValue) return 'error';
  return typeof v === 'number' ? 'num' : typeof v === 'boolean' ? 'bool' : 'string';
}
const TYPE_OK = {
  num: v => typeof v === 'number',
  bool: v => typeof v === 'boolean',
  string: v => typeof v === 'string',
  input: v => typeof v === 'string',
  classIns: v => v instanceof Instance,
  list: v => v instanceof CitList || v instanceof CitDict || v instanceof CitSet,
  '?': () => true, // optional: any type
  enum: v => v instanceof EnumValue || v instanceof EnumType,
  error: v => v instanceof ErrorValue,
  ui: v => v instanceof UiElement || v instanceof UiRoot,
  class: () => true
};
const CASTS = ['parseInt', 'parseFloat', 'parseString', 'parseBool'];

function repr(v) { return typeof v === 'string' ? JSON.stringify(v) : fmt(v); }
function fmt(v) {
  if (v === null) return 'Null';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (v instanceof CitList) {
    const inner = v.items.map(repr).join(', ');
    return v.tuple ? '(' + inner + (v.items.length === 1 ? ',' : '') + ')' : '[' + inner + ']';
  }
  if (v instanceof CitSet) return v.map.size ? '{' + v.values().map(repr).join(', ') + '}' : 'set()';
  if (v instanceof Module) return `<module ${v.name}>`;
  if (v instanceof CitDict) return '{' + [...v.map].map(([k, x]) => `${k}: ${fmt(x)}`).join(', ') + '}';
  if (v instanceof EnumValue) return `${v.type.name}.${v.index}`;
  if (v instanceof ErrorValue) return `error.${v.name}: ${v.message}`;
  if (v instanceof EnumType) return `<enum ${v.name}>`;
  if (v instanceof Instance) return `<${v.cls.name} instance>`;
  if (v instanceof UiElement) return v.text;
  if (v instanceof UiRoot) return `<ui ${v.name}>`;
  return String(v);
}
function equals(a, b) {
  if (a instanceof CitList && b instanceof CitList) {
    return a.tuple === b.tuple && a.items.length === b.items.length && a.items.every((x, i) => equals(x, b.items[i]));
  }
  if (a instanceof CitSet && b instanceof CitSet) return a.map.size === b.map.size && [...a.map.keys()].every(k => b.map.has(k));
  if (a instanceof CitDict && b instanceof CitDict) {
    return a.map.size === b.map.size && [...a.map].every(([k, x]) => b.map.has(k) && equals(x, b.map.get(k)));
  }
  return a === b;
}
function unescape(s) {
  return s.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', '"': '"', '\\': '\\' }[c] ?? c));
}
function needBool(v, what) {
  if (typeof v !== 'boolean') throw new CitError(`${what} needs a bool, got ${typeName(v)}.`);
  return v;
}

function binop(op, a, b) {
  if ((op === '|' || op === '&' || op === '^' || op === '-') && (a instanceof CitSet || b instanceof CitSet)) {
    if (!(a instanceof CitSet && b instanceof CitSet)) throw new CitError(`Operator '${op}' needs two sets.`);
    const out = new CitSet();
    const [x, y] = [a.values(), b.values()];
    if (op === '|') [...x, ...y].forEach(v => out.add(v));                        // union
    else if (op === '&') x.filter(v => b.has(v)).forEach(v => out.add(v));        // intersection
    else if (op === '-') x.filter(v => !b.has(v)).forEach(v => out.add(v));       // difference
    else { x.filter(v => !b.has(v)).forEach(v => out.add(v)); y.filter(v => !a.has(v)).forEach(v => out.add(v)); } // symmetric difference
    return out;
  }
  if (op === '|' || op === '&' || op === '^') throw new CitError(`Operator '${op}' works on sets.`);
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return fmt(a) + fmt(b);
  if (op === '==') return equals(a, b);
  if (op === '!=') return !equals(a, b);
  if (['<', '>', '<=', '>='].includes(op)) {
    if (typeof a !== typeof b || typeof a === 'boolean' || typeof a === 'object') throw new CitError(`Cannot compare ${typeName(a)} with ${typeName(b)} using '${op}'.`);
    return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
  }
  if (typeof a !== 'number' || typeof b !== 'number') throw new CitError(`Operator '${op}' needs numbers.`);
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': if (b === 0) throw new CitError('Division by zero.'); return a / b;
    case '%': if (b === 0) throw new CitError('Modulo by zero.'); return a % b;
  }
  throw new CitError(`Unknown operator '${op}'.`);
}

function cast(name, v) {
  if (name === 'parseString') return fmt(v);
  if (name === 'parseBool') {
    if (v === null) return false;
    if (v instanceof CitList) return v.items.length > 0;
    if (v instanceof CitDict || v instanceof CitSet) return v.map.size > 0;
    if (typeof v === 'object') return true;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return !['false', '0', ''].includes(v.trim().toLowerCase());
  }
  if (typeof v === 'object') throw new CitError(`${name}: cannot convert ${typeName(v)} to a number.`, undefined, 'ValueError');
  let n;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'boolean') n = v ? 1 : 0;
  else {
    n = v.trim() === '' ? NaN : Number(v);
    if (Number.isNaN(n)) throw new CitError(`${name}: cannot convert "${v}" to a number.`, undefined, 'ValueError');
  }
  return name === 'parseInt' ? Math.trunc(n) : n;
}

const stopped = ctx => ctx.cancelled || !!(ctx.io.isCancelled && ctx.io.isCancelled());

// cooperative loop step: cancellation, loop limit and a regular yield to the event loop
async function tick(ctx) {
  if (stopped(ctx)) throw new ExitSignal('NoErr');
  if (++ctx.steps > 1000000) throw new CitError('Loop limit exceeded (1,000,000 iterations).');
  if (ctx.steps % 200 === 0) await new Promise(r => (typeof setImmediate === 'function' ? setImmediate(r) : setTimeout(r, 0)));
}

// console.write: terminal + every ui.codeOutput element
function emitLine(ctx, line) {
  ctx.io.write(line);
  if (!ctx.ui) return;
  for (const el of ctx.ui.elements) {
    if (el.kind !== 'codeOutput') continue;
    el.log.push(line);
    if (el.log.length > 1000) el.log.shift();
    if (ctx.io.uiOutput) ctx.io.uiOutput(el.name, line);
  }
}

function toIndex(i, len) {
  if (typeof i !== 'number' || !Number.isInteger(i)) throw new CitError('An index must be a whole number.');
  const k = i < 0 ? len + i : i;
  if (k < 0 || k >= len) throw new CitError(`Index ${i} is out of range (size ${len}).`);
  return k;
}

function listMethod(list, name, args) {
  const mutate = () => {
    if (list.tuple) throw new CitError(`Tuples cannot be changed - '.${name}()' only works on lists ([ ]).`);
  };
  const count = n => { if (args.length !== n) throw new CitError(`${name} expects ${n} argument(s) but got ${args.length}.`); };
  const whole = (v, what) => {
    if (typeof v !== 'number' || !Number.isInteger(v)) throw new CitError(`${what} must be a whole number.`);
    return v;
  };
  const items = list.items;
  switch (name) {
    case 'push': mutate(); count(1); items.push(args[0]); return null;
    case 'unshift': mutate(); count(1); items.unshift(args[0]); return null;
    case 'pop': mutate(); count(0); if (!items.length) throw new CitError('Cannot pop from an empty list.'); return items.pop();
    case 'shift': mutate(); count(0); if (!items.length) throw new CitError('Cannot shift an empty list.'); return items.shift();
    case 'splice': {
      mutate();
      if (args.length < 1) throw new CitError('splice needs at least a start index: splice(start, deleteCount, items...).');
      const len = items.length;
      let start = whole(args[0], 'splice start');
      start = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
      let del = args.length > 1 ? whole(args[1], 'splice deleteCount') : len - start;
      del = Math.max(0, Math.min(del, len - start));
      return new CitList(items.splice(start, del, ...args.slice(2)), false); // the removed items
    }
  }
  throw new CitError(`A ${list.tuple ? 'tuple' : 'list'} has no method '${name}'. Methods: push, pop, unshift, shift, splice.`);
}

function dictMethod(d, name, args) {
  const count = n => { if (args.length !== n) throw new CitError(`${name} expects ${n} argument(s) but got ${args.length}.`); };
  switch (name) {
    case 'keys': count(0); return new CitList([...d.map.keys()], false);
    case 'values': count(0); return new CitList([...d.map.values()], false);
    case 'has': count(1); return d.map.has(args[0]);
    case 'remove': {
      count(1);
      if (!d.map.has(args[0])) throw new CitError(`Key ${repr(args[0])} not found.`);
      const v = d.map.get(args[0]); d.map.delete(args[0]); return v;
    }
  }
  throw new CitError(`A dictionary has no method '${name}'. Methods: keys, values, has, remove.`);
}

async function interpolate(a, scope, ctx) {
  const re = a.fmt ? /\{([^}]*)\}/g : /\$\$\{([^}]*)\}/g;
  let out = '', last = 0, m;
  while ((m = re.exec(a.raw))) {
    out += unescape(a.raw.slice(last, m.index));
    out += fmt(await ev(parseExpr(m[1]), scope, ctx));
    last = re.lastIndex;
  }
  return out + unescape(a.raw.slice(last));
}

function inputValid(el) {
  const v = el.value, a = el.attrs;
  if (a.required !== undefined && a.required !== 'False' && v === '') return false;
  if (a.minLength !== undefined && v.length > 0 && v.length < Number(a.minLength)) return false;
  if (a.maxLength !== undefined && v.length > Number(a.maxLength)) return false;
  if (a.type === 'email' && v !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return false;
  if (a.type === 'number' && v !== '' && Number.isNaN(Number(v))) return false;
  return true;
}

async function evMember(a, scope, ctx) {
  const prop = a.prop;
  const named = a.obj.type === 'var';
  const val = named ? getVar(scope, a.obj.name).value : await ev(a.obj, scope, ctx);
  if (val instanceof Instance) {
    if (val.attrs.has(prop)) return val.attrs.get(prop);
    if (named && prop === 'name') return a.obj.name;
    if (named && prop === 'value') return fmt(val);
    throw new CitError(`${named ? `'${a.obj.name}' (${val.cls.name})` : val.cls.name} has no attribute '${prop}'.`);
  }
  if (val instanceof ErrorValue) {
    if (prop === 'name') return val.name;
    if (prop === 'message' || prop === 'value') return val.message;
    if (prop === 'line') return val.line + 1;
    throw new CitError(`An error has no property '${prop}'. Use .name, .message or .line.`);
  }
  if (val instanceof UiElement && val.kind === 'input') {
    if (prop === 'text' || prop === 'value') return val.value;
    if (prop === 'placeholder') return val.text;
    if (prop === 'valid') return inputValid(val);
    if (prop === 'length') return val.value.length;
  }
  if (val instanceof UiElement) {
    if (prop === 'text' || prop === 'value') return val.kind === 'codeOutput' && val.log.length ? val.log.join('\n') : val.text;
    if (prop === 'name') return val.name;
    if (Object.prototype.hasOwnProperty.call(val.attrs, prop)) return val.attrs[prop];
    throw new CitError(`ui element '${val.name}' has no property '${prop}'.`);
  }
  if (val instanceof UiRoot) {
    if (prop === 'title') return val.title;
    if (prop === 'name') return val.name;
    if (Object.prototype.hasOwnProperty.call(val.attrs, prop)) return val.attrs[prop];
    throw new CitError(`ui root '${val.name}' has no property '${prop}'.`);
  }
  if (val instanceof Module) return moduleMember(val, prop);
  if (val instanceof CitSet) {
    if (prop === 'length') return val.map.size;
    if (prop === 'value') return val;
    if (prop === 'name' && named) return a.obj.name;
    throw new CitError(`A set has no property '${prop}'. Use .length.`);
  }
  if (val instanceof CitDict) {
    if (val.map.has(prop)) return val.map.get(prop);
    if (prop === 'length') return val.map.size;
    if (prop === 'value') return val;
    if (prop === 'name' && named) return a.obj.name;
    throw new CitError(`No key '${prop}' in ${named ? `'${a.obj.name}'` : 'the dictionary'}.`);
  }
  if (val instanceof EnumType) {
    const i = val.members.indexOf(prop);
    if (i >= 0) return val.values[i];
    if (prop === 'length') return val.members.length;
    if (prop === 'name') return val.name;
    throw new CitError(`Enum '${val.name}' has no member '${prop}'.`);
  }
  if (val instanceof EnumValue) {
    if (prop === 'name') return val.name;
    if (prop === 'index' || prop === 'value') return val.index;
    if (prop === 'enum') return val.type.name;
    throw new CitError(`Enum value ${fmt(val)} has no property '${prop}'.`);
  }
  if ((val instanceof CitList || typeof val === 'string') && prop === 'length') return val instanceof CitList ? val.items.length : val.length;
  if (prop === 'value') return val;
  if (prop === 'name' && named) return a.obj.name;
  throw new CitError(named ? `Unknown property '.${prop}'. Use .value or .name.` : `Unknown property '.${prop}'.`);
}

async function ev(a, scope, ctx) {
  switch (a.type) {
    case 'lit': return a.v;
    case 'str': return interpolate(a, scope, ctx);
    case 'var': return getVar(scope, a.name).value;
    case 'member': return evMember(a, scope, ctx);
    case 'list': {
      const items = [];
      for (const x of a.items) {
        const v = await ev(x, scope, ctx);
        if (v === undefined) throw new CitError('A function that returns nothing cannot be used as a value.');
        items.push(v);
      }
      return new CitList(items, a.tuple);
    }
    case 'set': {
      const st = new CitSet();
      for (const x of a.items) {
        const v = await ev(x, scope, ctx);
        if (v === undefined) throw new CitError('A function that returns nothing cannot be used as a value.');
        st.add(v);
      }
      return st;
    }
    case 'pair': return new Pair(await ev(a.left, scope, ctx), await ev(a.right, scope, ctx));
    case 'dict': {
      const map = new Map();
      for (const e of a.entries) {
        const v = await ev(e.value, scope, ctx);
        if (v === undefined) throw new CitError('A function that returns nothing cannot be used as a value.');
        map.set(e.key, v);
      }
      return new CitDict(map);
    }
    case 'index': {
      const obj = await ev(a.obj, scope, ctx);
      const idx = await ev(a.index, scope, ctx);
      if (obj instanceof CitDict) {
        if (!obj.map.has(idx)) throw new CitError(`Key ${repr(idx)} not found.`);
        return obj.map.get(idx);
      }
      if (obj instanceof EnumType) {
        if (typeof idx === 'string') {
          const i = obj.members.indexOf(idx);
          if (i < 0) throw new CitError(`Enum '${obj.name}' has no member '${idx}'.`);
          return obj.values[i];
        }
        return obj.members[toIndex(idx, obj.members.length)]; // the member's name
      }
      if (obj instanceof CitList) return obj.items[toIndex(idx, obj.items.length)];
      if (typeof obj === 'string') return obj[toIndex(idx, obj.length)];
      throw new CitError(`Cannot use [ ] on a ${typeName(obj)}.`);
    }
    case 'not': return !needBool(await ev(a.e, scope, ctx), "'!'");
    case 'neg': {
      const v = await ev(a.e, scope, ctx);
      if (typeof v !== 'number') throw new CitError("Unary '-' needs a num.");
      return -v;
    }
    case 'bin': {
      if (a.op === '&&' || a.op === '||') {
        const l = needBool(await ev(a.left, scope, ctx), `'${a.op}'`);
        if (a.op === '&&' && !l) return false;
        if (a.op === '||' && l) return true;
        return needBool(await ev(a.right, scope, ctx), `'${a.op}'`);
      }
      return binop(a.op, await ev(a.left, scope, ctx), await ev(a.right, scope, ctx));
    }
    case 'call': return callFn(a, scope, ctx);
    case 'mcall': return callMethod(a, scope, ctx);
  }
  throw new CitError('Invalid expression.');
}

async function evalArgs(list, scope, ctx) {
  const out = [];
  for (const x of list) {
    const v = await ev(x, scope, ctx);
    if (v === undefined) throw new CitError('A function that returns nothing cannot be used as a value.');
    out.push(v);
  }
  return out;
}
function needArgs(label, args, n) {
  if (args.length !== n) throw new CitError(`${label} expects ${n} argument(s) but got ${args.length}.`);
}

function findMethod(cls, name, ctx) {
  let c = cls, hops = 0;
  while (c && hops++ < 50) {
    if (c.methods.has(name)) return c.methods.get(name);
    c = c.parentName ? ctx.classes.get(c.parentName) : null;
  }
  return null;
}

// Functions and methods without a return value give back Null.
// Missing trailing arguments and SKIP markers use the parameter's default value.
function checkArity(params, args, label) {
  if (args.length > params.length) throw new CitError(`${label} expects ${params.length} argument(s) but got ${args.length}.`);
  for (let i = 0; i < params.length; i++) {
    if ((i >= args.length || args[i] === SKIP) && params[i].def === null) {
      throw new CitError(`${label}: missing a value for '${params[i].name}'.`);
    }
  }
}
async function bindParams(params, args, scope, ctx, label) {
  checkArity(params, args, label);
  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    let v;
    if (i < args.length && args[i] !== SKIP) v = args[i];
    else {
      v = await ev(parseExpr(p.def), scope, ctx); // may use earlier parameters
      if (v === undefined) throw new CitError('A function that returns nothing cannot be used as a value.');
    }
    scope.vars.set(p.name, { mod: 'default', type: typeName(v), value: v });
  }
}
// Writing a parameter's own name as the argument (add(a, 2)) means: use its default.
async function evalArgsFor(list, params, scope, ctx) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i], p = params && params[i];
    if (p && p.def !== null && x.type === 'var' && x.name === p.name) { out.push(SKIP); continue; }
    const v = await ev(x, scope, ctx);
    if (v === undefined) throw new CitError('A function that returns nothing cannot be used as a value.');
    out.push(v);
  }
  return out;
}

async function callUser(f, args, ctx, inst) {
  checkArity(f.params, args, f.name);
  if (ctx.depth >= 200) throw new CitError('Too many nested function calls.');
  const s = new Scope(f.scope);
  if (inst) {
    s.vars.set('this', { mod: 'const', type: 'classIns', value: inst });
    s.vars.set('__owner', { mod: 'const', type: 'class', value: f.owner });
  }
  await bindParams(f.params, args, s, ctx, f.name);
  ctx.depth++;
  try { await execBlock(f.body, s, ctx); }
  catch (e) {
    if (e instanceof ReturnSignal) return e.value;
    if (e instanceof BreakSignal || e instanceof ContinueSignal) throw new CitError('`break` / `continue` used outside a loop.');
    throw e;
  } finally { ctx.depth--; }
  return null;
}

// ---------------------------------------------------------------- tasks
async function taskRef(node, scope, ctx, evalArgsToo) {
  let name, argNodes = [];
  if (node.type === 'call') { name = node.name; argNodes = node.args; }
  else if (node.type === 'var') name = node.name;
  else throw new CitError('Give a task, for example task.start(myTask()).');
  const def = ctx.tasks.get(name);
  if (!def) throw new CitError(`Unknown task '${name}'.`);
  return { def, args: evalArgsToo ? await evalArgsFor(argNodes, def.params, scope, ctx) : [] };
}

function stopInstance(inst) { inst.stopped = true; inst.stopWake(); }
function stopAllTasks(ctx) { for (const inst of ctx.taskInsts) stopInstance(inst); }
function failAll(ctx, fatal) {
  if (!ctx.fatal) ctx.fatal = fatal;
  ctx.cancelled = true;
  stopAllTasks(ctx);
}

// Runs the task body again and again (limit = null means: until stopped).
async function runInstance(inst, args, ctx) {
  try {
    while (!inst.stopped && !stopped(ctx) && (inst.limit === null || inst.count < inst.limit)) {
      await tick(ctx);
      try {
        const s = new Scope(inst.def.scope);
        await bindParams(inst.def.params, args, s, ctx, `task ${inst.def.name}`);
        await execBlock(inst.def.body, s, ctx);
      } catch (e) {
        if (e instanceof ContinueSignal) { /* next repetition */ }
        else if (e instanceof BreakSignal || e instanceof ReturnSignal) break; // stops this task
        else throw e;
      }
      inst.count++;
      inst.resolveFirst();
    }
  } catch (e) {
    if (e instanceof TaskStop || e instanceof ExitSignal) { /* quiet stop */ }
    else if (e instanceof RaiseSignal) failAll(ctx, { exit: e.name, error: { message: `error.${e.name} was raised`, line: e.line } });
    else if (e instanceof CitError) failAll(ctx, { exit: e.kind || 'ErrUnknown', error: { message: e.message, line: e.citLine == null ? 0 : e.citLine } });
    else throw e;
  } finally {
    ctx.taskInsts.delete(inst);
    inst.resolveFirst();
  }
}

// Starts a task in the background. Like Roblox's task.spawn it runs immediately until its first task.wait().
async function startTask(def, args, limit, ctx) {
  checkArity(def.params, args, `task ${def.name}`);
  const inst = { def, limit, count: 0, stopped: false };
  inst.firstYield = new Promise(r => { inst.resolveFirst = r; });
  inst.stopSignal = new Promise(r => { inst.stopWake = r; });
  ctx.taskInsts.add(inst);
  inst.done = als.run(inst, () => runInstance(inst, args, ctx)).catch(e => failAll(ctx, { exit: 'ErrUnknown', error: { message: String(e && e.message || e), line: 0 } }));
  await inst.firstYield;
}

async function repeatCount(node, scope, ctx) {
  const n = await ev(node, scope, ctx);
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new CitError('The repeat count must be a whole number (0 or more).');
  return n;
}

// task.start(t()), task.repeat(t(), n), task.stop(t())
async function taskControl(a, scope, ctx) {
  if (a.name === 'repeat') {
    needArgs('task.repeat', a.args, 2);
    const { def, args } = await taskRef(a.args[0], scope, ctx, true);
    await startTask(def, args, await repeatCount(a.args[1], scope, ctx), ctx);
  } else if (a.name === 'start') {
    needArgs('task.start', a.args, 1);
    const { def, args } = await taskRef(a.args[0], scope, ctx, true);
    await startTask(def, args, null, ctx);
  } else {
    needArgs('task.stop', a.args, 1);
    const { def } = await taskRef(a.args[0], scope, ctx, false);
    for (const inst of [...ctx.taskInsts]) if (inst.def === def) stopInstance(inst);
  }
  return null;
}

async function waitTasks(ctx) {
  while (ctx.taskInsts.size) await Promise.race([...ctx.taskInsts].map(i => i.done));
}

// ---------------------------------------------------------------- built-in functions, math, strings, sets
const BUILTINS = ['type', 'isinstance', 'issubclass', 'len', 'list', 'set', 'tuple', 'max', 'min'];

function typeOf(v) { // what type() answers
  if (v === null) return 'Null';
  if (typeof v === 'number') return 'num';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'string') return 'string';
  if (v instanceof CitList) return v.tuple ? 'tuple' : 'list';
  if (v instanceof CitDict) return 'dict';
  if (v instanceof CitSet) return 'set';
  if (v instanceof Instance) return v.cls.name;
  if (v instanceof EnumValue) return v.type.name;
  if (v instanceof EnumType) return 'enum';
  if (v instanceof ErrorValue) return 'error';
  if (v instanceof Module) return 'module';
  return 'ui';
}
function iterItems(v, fname) {
  if (v instanceof CitList) return [...v.items];
  if (v instanceof CitSet) return v.values();
  if (v instanceof CitDict) return [...v.map.keys()];
  if (typeof v === 'string') return [...v];
  if (v instanceof EnumType) return [...v.values];
  throw new CitError(`${fname}() needs a list, tuple, set, dictionary or string, but got a ${typeName(v)}.`);
}
function newSet(items) { const st = new CitSet(); for (const x of items) st.add(x); return st; }
function isSubclass(a, b, ctx) {
  let c = a, hops = 0;
  while (c && hops++ < 50) { if (c === b) return true; c = c.parentName ? ctx.classes.get(c.parentName) : null; }
  return false;
}
// class names, "type names", enums, or a tuple of them
async function typeRefs(node, scope, ctx) {
  if (node.type === 'list') {
    const out = [];
    for (const x of node.items) out.push(...await typeRefs(x, scope, ctx));
    return out;
  }
  if (node.type === 'var' && ctx.classes.has(node.name)) return [{ cls: ctx.classes.get(node.name) }];
  const v = await ev(node, scope, ctx);
  if (typeof v === 'string') return [{ type: v }];
  if (v instanceof EnumType) return [{ enum: v }];
  if (v instanceof CitList && v.items.every(x => typeof x === 'string')) return v.items.map(x => ({ type: x }));
  throw new CitError('Give a class name or a type name like "num".');
}

async function callBuiltin(a, scope, ctx) {
  const name = a.name;
  if (name === 'isinstance') {
    needArgs(name, a.args, 2);
    const obj = await ev(a.args[0], scope, ctx);
    const refs = await typeRefs(a.args[1], scope, ctx);
    return refs.some(r => (r.cls ? obj instanceof Instance && isSubclass(obj.cls, r.cls, ctx)
      : r.enum ? obj instanceof EnumValue && obj.type === r.enum : typeOf(obj) === r.type));
  }
  if (name === 'issubclass') {
    needArgs(name, a.args, 2);
    const subs = await typeRefs(a.args[0], scope, ctx);
    if (subs.length !== 1 || !subs[0].cls) throw new CitError('issubclass() needs a class name as its first argument.');
    const sups = await typeRefs(a.args[1], scope, ctx);
    if (sups.some(r => !r.cls)) throw new CitError('issubclass() needs class names.');
    return sups.some(r => isSubclass(subs[0].cls, r.cls, ctx));
  }
  const args = await evalArgs(a.args, scope, ctx);
  const maxArgs = (n) => { if (args.length > n) throw new CitError(`${name}() expects at most ${n} argument(s) but got ${args.length}.`); };
  switch (name) {
    case 'type': needArgs(name, args, 1); return typeOf(args[0]);
    case 'len': {
      needArgs(name, args, 1);
      const v = args[0];
      if (typeof v === 'string') return v.length;
      if (v instanceof CitList) return v.items.length;
      if (v instanceof CitDict || v instanceof CitSet) return v.map.size;
      if (v instanceof EnumType) return v.members.length;
      throw new CitError(`len() needs a string, list, tuple, set, dictionary or enum, but got a ${typeName(v)}.`);
    }
    case 'list': maxArgs(1); return new CitList(args.length ? iterItems(args[0], name) : [], false);
    case 'tuple': maxArgs(1); return new CitList(args.length ? iterItems(args[0], name) : [], true);
    case 'set': maxArgs(1); return newSet(args.length ? iterItems(args[0], name) : []);
    default: { // max / min
      const single = args.length === 1 && (args[0] instanceof CitList || args[0] instanceof CitSet || args[0] instanceof CitDict);
      const items = single ? iterItems(args[0], name) : args;
      if (!items.length) throw new CitError(`${name}() needs at least one value.`, undefined, 'ValueError');
      const kind = typeof items[0];
      if ((kind !== 'number' && kind !== 'string') || items.some(x => typeof x !== kind)) {
        throw new CitError(`${name}() compares only numbers or only strings.`, undefined, 'ValueError');
      }
      return items.reduce((m, x) => ((name === 'max' ? x > m : x < m) ? x : m));
    }
  }
}

const MATH_CONST = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
const MATH_FUNCS = ['ceiling', 'floor', 'trunc', 'sqrt', 'cbrt', 'power', 'log', 'log10', 'sin', 'cos', 'tan', 'degrees', 'radians', 'factorial', 'gcd', 'fabs'];
function moduleMember(mod, prop) {
  if (Object.prototype.hasOwnProperty.call(MATH_CONST, prop)) return MATH_CONST[prop];
  if (MATH_FUNCS.includes(prop)) throw new CitError(`${mod.name}.${prop} is a function. Call it: ${mod.name}.${prop}(...)`);
  throw new CitError(`The math module has no '${prop}'. Constants: ${Object.keys(MATH_CONST).join(', ')}. Functions: ${MATH_FUNCS.join(', ')}.`);
}
function moduleCall(mod, name, args) {
  const bad = (msg) => new CitError(`math.${name}: ${msg}`, undefined, 'ValueError');
  const count = (min, max = min) => {
    if (args.length < min || args.length > max) throw new CitError(`math.${name} expects ${min === max ? min : min + ' or ' + max} argument(s) but got ${args.length}.`);
  };
  const num = i => { if (typeof args[i] !== 'number') throw bad('needs numbers.'); return args[i]; };
  const whole = i => { const v = num(i); if (!Number.isInteger(v)) throw bad('needs whole numbers.'); return v; };
  switch (name) {
    case 'ceiling': count(1); return Math.ceil(num(0));
    case 'floor': count(1); return Math.floor(num(0));
    case 'trunc': count(1); return Math.trunc(num(0));
    case 'fabs': count(1); return Math.abs(num(0));
    case 'sqrt': count(1); if (num(0) < 0) throw bad('cannot take the square root of a negative number.'); return Math.sqrt(args[0]);
    case 'cbrt': count(1); return Math.cbrt(num(0));
    case 'power': { count(2); const r = Math.pow(num(0), num(1)); if (Number.isNaN(r)) throw bad('the result is not a real number.'); return r; }
    case 'log': {
      count(1, 2);
      if (num(0) <= 0) throw bad('needs a number greater than 0.');
      if (args.length === 1) return Math.log(args[0]);
      const base = num(1);
      if (base <= 0 || base === 1) throw bad('the base must be greater than 0 and not 1.');
      return base === 2 ? Math.log2(args[0]) : base === 10 ? Math.log10(args[0]) : Math.log(args[0]) / Math.log(base);
    }
    case 'log10': count(1); if (num(0) <= 0) throw bad('needs a number greater than 0.'); return Math.log10(args[0]);
    case 'sin': count(1); return Math.sin(num(0));
    case 'cos': count(1); return Math.cos(num(0));
    case 'tan': count(1); return Math.tan(num(0));
    case 'degrees': count(1); return num(0) * 180 / Math.PI;
    case 'radians': count(1); return num(0) * Math.PI / 180;
    case 'factorial': {
      count(1);
      const n = whole(0);
      if (n < 0) throw bad('needs a number that is 0 or more.');
      if (n > 170) throw bad('the result is too large.');
      let r = 1; for (let i = 2; i <= n; i++) r *= i;
      return r;
    }
    case 'gcd': {
      count(2);
      let x = Math.abs(whole(0)), y = Math.abs(whole(1));
      while (y) [x, y] = [y, x % y];
      return x;
    }
  }
  throw new CitError(`The math module has no function '${name}'. Functions: ${MATH_FUNCS.join(', ')}.`);
}

function setMethod(st, name, args) {
  const count = n => { if (args.length !== n) throw new CitError(`${name} expects ${n} argument(s) but got ${args.length}.`); };
  switch (name) {
    case 'add': count(1); st.add(args[0]); return null;
    case 'discard': count(1); st.delete(args[0]); return null; // no error if it is not there
    case 'remove': count(1); if (!st.delete(args[0])) throw new CitError(`${repr(args[0])} is not in the set.`); return null;
    case 'has': count(1); return st.has(args[0]);
    case 'clear': count(0); st.map.clear(); return null;
  }
  throw new CitError(`A set has no method '${name}'. Methods: add, discard, remove, has, clear.`);
}

const STRING_METHODS = ['toUpperCase', 'toLowerCase', 'replace', 'includes', 'startsWith', 'endsWith', 'substring'];
function stringMethod(s, name, args) {
  const count = (min, max = min) => {
    if (args.length < min || args.length > max) throw new CitError(`${name} expects ${min === max ? min : min + ' or ' + max} argument(s) but got ${args.length}.`);
  };
  const str = i => { if (typeof args[i] !== 'string') throw new CitError(`${name} needs a string.`); return args[i]; };
  switch (name) {
    case 'toUpperCase': count(0); return s.toUpperCase();
    case 'toLowerCase': count(0); return s.toLowerCase();
    case 'includes': count(1); return s.includes(str(0));
    case 'startsWith': count(1); return s.startsWith(str(0));
    case 'endsWith': count(1); return s.endsWith(str(0));
    case 'substring': {
      count(1, 2);
      if (args.some(v => typeof v !== 'number' || !Number.isInteger(v))) throw new CitError('substring needs whole numbers.');
      return s.substring(args[0], args.length > 1 ? args[1] : undefined);
    }
    case 'replace': { // replace("old" => "new")  or  replace("old", "new"); replaces every match
      let from, to;
      if (args.length === 1 && args[0] instanceof Pair) { from = args[0].left; to = args[0].right; }
      else { count(2); from = args[0]; to = args[1]; }
      if (typeof from !== 'string' || typeof to !== 'string') throw new CitError('replace needs strings: replace("old" => "new").');
      if (from === '') throw new CitError('replace: the text to find cannot be empty.');
      return s.split(from).join(to);
    }
  }
  throw new CitError(`A string has no method '${name}'. Methods: ${STRING_METHODS.join(', ')}.`);
}

async function callFn(a, scope, ctx) {
  if (CASTS.includes(a.name)) {
    const args = await evalArgs(a.args, scope, ctx);
    needArgs(a.name, args, 1);
    return cast(a.name, args[0]);
  }
  const cls = ctx.classes.get(a.name);
  if (cls) {
    const inst = new Instance(cls);
    const init = findMethod(cls, '_init', ctx);
    const args = await evalArgsFor(a.args, init ? init.params : null, scope, ctx);
    if (init) await callUser(init, args, ctx, inst);
    else needArgs(`class ${cls.name}`, args, 0);
    return inst;
  }
  const f = findFunc(scope, a.name);
  if (f) return callUser(f, await evalArgsFor(a.args, f.params, scope, ctx), ctx, null);
  if (BUILTINS.includes(a.name)) return callBuiltin(a, scope, ctx);
  let rec = null;
  try { rec = getVar(scope, a.name); } catch (e) { rec = null; }
  if (rec) throw new CitError(`'${a.name}' is a ${typeName(rec.value)} variable, not a function. Pass it as '${a.name}' (without parentheses).`);
  if (ctx.tasks.has(a.name)) throw new CitError(`'${a.name}' is a task. Use task.start(${a.name}()) or task.repeat(${a.name}(), n).`);
  throw new CitError(`Unknown function '${a.name}'.`);
}

async function callMethod(a, scope, ctx) {
  const nm = a.obj.type === 'var' ? a.obj.name : null;
  if (nm === 'task' && ['start', 'repeat', 'stop'].includes(a.name)) return taskControl(a, scope, ctx);
  if (nm === 'console') {
    const args = await evalArgs(a.args, scope, ctx);
    if (a.name === 'write') { emitLine(ctx, args.map(fmt).join(' ')); return null; }
    if (a.name === 'input') {
      const r = await ctx.io.input(args.length ? fmt(args[0]) : '');
      if (r === undefined) throw new CitError('Input was cancelled.');
      return String(r);
    }
    throw new CitError(`console has no method '${a.name}'.`);
  }
  if (nm === 'task') {
    const args = await evalArgs(a.args, scope, ctx);
    if (a.name !== 'wait') throw new CitError(`task has no method '${a.name}'.`);
    needArgs('task.wait', args, 1);
    if (typeof args[0] !== 'number' || args[0] < 0) throw new CitError('task.wait needs a number of seconds (0 or more).');
    if (stopped(ctx)) throw new ExitSignal('NoErr');
    const sleeping = ctx.io.sleep ? ctx.io.sleep(args[0] * 1000) : new Promise(r => setTimeout(r, args[0] * 1000));
    const inst = als.getStore();
    if (inst) { // inside a task: waiting is where other code gets to run, and where task.stop() can interrupt
      inst.resolveFirst();
      await Promise.race([sleeping, inst.stopSignal]);
      if (inst.stopped) throw new TaskStop();
    } else await sleeping;
    if (stopped(ctx)) throw new ExitSignal('NoErr');
    return null;
  }
  if (nm === 'super') {
    let owner;
    try { owner = getVar(scope, '__owner').value; } catch (e) { throw new CitError('`super` can only be used inside a class method.'); }
    const parent = owner.parentName ? ctx.classes.get(owner.parentName) : null;
    if (!parent) throw new CitError(`Class '${owner.name}' has no parent class.`);
    const m = findMethod(parent, a.name, ctx);
    if (!m) throw new CitError(`Parent class '${parent.name}' has no method '${a.name}'.`);
    return callUser(m, await evalArgsFor(a.args, m.params, scope, ctx), ctx, getVar(scope, 'this').value);
  }
  const target = await ev(a.obj, scope, ctx);
  if (target instanceof Instance) {
    const m = findMethod(target.cls, a.name, ctx); // runtime class decides -> polymorphism
    if (!m) throw new CitError(`${target.cls.name} has no method '${a.name}'.`);
    return callUser(m, await evalArgsFor(a.args, m.params, scope, ctx), ctx, target);
  }
  const args = await evalArgs(a.args, scope, ctx);
  if (target instanceof Module) return moduleCall(target, a.name, args);
  if (typeof target === 'string') return stringMethod(target, a.name, args);
  if (target instanceof CitSet) return setMethod(target, a.name, args);
  if (target instanceof CitList) return listMethod(target, a.name, args);
  if (target instanceof CitDict) return dictMethod(target, a.name, args);
  throw new CitError(`Cannot call '.${a.name}()' on ${typeName(target)}.`);
}

// ---------------------------------------------------------------- program tree
// single-line statement -> node
function simpleNode(t, i) {
  const c = classify(t);
  switch (c.k) {
    case 'return': return { type: 'return', line: i, name: c.name };
    case 'break': return { type: 'break', line: i };
    case 'continue': return { type: 'continue', line: i };
    case 'pass': return { type: 'pass', line: i };
    case 'retval': return { type: 'retval', line: i, expr: c.expr };
    case 'raisestmt': return { type: 'raise', line: i, name: c.name, body: [] };
    default: return { type: 'stmt', line: i, text: t };
  }
}

function build(text) {
  const top = [];
  const stack = []; // frames: { node, list }
  const cur = () => (stack.length ? stack[stack.length - 1].list : top);
  const open = (n, list) => { cur().push(n); stack.push({ node: n, list }); };
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = stripComment(raw).trim();
    if (!t) return;
    const c = classify(t);
    const f = stack[stack.length - 1];
    let n;
    switch (c.k) {
      case 'main': n = { type: 'main', line: i, body: [] }; open(n, n.body); break;
      case 'class': n = { type: 'class', line: i, name: c.name, parent: c.parent, body: [] }; open(n, n.body); break;
      case 'uiroot': n = { type: 'uiroot', line: i, name: c.name, attrs: c.attrs, body: [] }; open(n, n.body); break;
      case 'if':
        n = { type: 'if', line: i, branches: [{ cond: c.cond, line: i, body: [] }], elseBody: null };
        open(n, n.branches[0].body); break;
      case 'elseif': { const b = { cond: c.cond, line: i, body: [] }; f.node.branches.push(b); f.list = b.body; break; }
      case 'else': f.node.elseBody = []; f.list = f.node.elseBody; break;
      case 'while': n = { type: 'while', line: i, cond: c.cond, body: [] }; open(n, n.body); break;
      case 'for': n = { type: 'for', line: i, v: c.v, from: c.from, to: c.to, body: [] }; open(n, n.body); break;
      case 'func': n = { type: 'func', line: i, name: c.name, params: c.params, body: [] }; open(n, n.body); break;
      case 'funcarg': n = { type: 'funcarg', line: i, target: c.target, name: c.name, params: c.params, body: [] }; open(n, n.body); break;
      case 'end': case 'endcall': stack.pop(); break;
      case 'task': n = { type: 'task', line: i, name: c.name, params: c.params, body: [] }; open(n, n.body); break;
      case 'when': n = { type: 'when', line: i, subject: c.cond, body: [] }; open(n, n.body); break;
      case 'whencase': cur().push({ type: 'case', line: i, cond: c.cond, node: simpleNode(c.rhs + ';', i) }); break;
      case 'enum': n = { type: 'enum', line: i, mod: c.mod, name: c.name, members: [] }; open(n, n.members); break;
      case 'enummember': cur().push(c.member); break;
      case 'switch': n = { type: 'switch', line: i, subject: c.subject, cases: [], defaultBody: null }; open(n, n.cases); break;
      case 'swcase': { const cs = { line: i, values: c.values, body: [] }; f.node.cases.push(cs); stack.push({ node: cs, list: cs.body }); break; }
      case 'swdefault': f.node.defaultBody = []; stack.push({ node: {}, list: f.node.defaultBody }); break;
      case 'try': n = { type: 'try', line: i, tryBody: [], catchVar: null, catchBody: null, finallyBody: null }; open(n, n.tryBody); break;
      case 'catch': f.node.catchVar = c.v; f.node.catchBody = []; f.list = f.node.catchBody; break;
      case 'finally': f.node.finallyBody = []; f.list = f.node.finallyBody; break;
      case 'uistyle': n = { type: 'uistyle', line: i, name: c.name, rules: [] }; open(n, n.rules); break;
      case 'srule': { const rule = { selectors: splitTopLevel(c.selectors).map(x => x.trim()), props: [], line: i }; cur().push(rule); stack.push({ node: rule, list: rule.props }); break; }
      case 'sruleline': {
        const props = [];
        for (const p of splitTopLevel(c.body, ';')) {
          const pm = /^\s*([A-Za-z][\w-]*)\s*=\s*([\s\S]+?)\s*$/.exec(p);
          if (pm) props.push({ prop: pm[1], value: pm[2], line: i });
        }
        cur().push({ selectors: splitTopLevel(c.selectors).map(x => x.trim()), props, line: i });
        break;
      }
      case 'sclose': stack.pop(); break;
      case 'raise': n = { type: 'raise', line: i, name: c.name, body: [] }; open(n, n.body); break;
      case 'import': cur().push({ type: 'import', line: i, name: c.name, alias: c.alias }); break;
      case 'uielem': cur().push({ type: 'uielem', line: i, name: c.name, kind: c.el, attrs: c.attrs, text: c.text }); break;
      default:
        if (f && f.node.selectors) { // a property line inside a style rule
          const pm = /^([A-Za-z][\w-]*)\s*=\s*(.+);$/.exec(t);
          if (pm) cur().push({ prop: pm[1], value: pm[2], line: i });
        } else cur().push(simpleNode(t, i));
    }
  });
  return top;
}

const DECL = /^(default|global|const)\s+(num|bool|string|input|classIns|list|enum|\?)\s+([A-Za-z_]\w*)\s*=\s*(.+);$/;
const INDEX_ASSIGN = /^([A-Za-z_]\w*)\s*\[(.+?)\]\s*(=|\+=|-=|\*=|\/=|%=)\s*(.+);$/;
const MEMBER_ASSIGN = /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*(=|\+=|-=|\*=|\/=|%=)\s*(.+);$/;
const ASSIGN = /^([A-Za-z_]\w*)\s*(=|\+=|-=|\*=|\/=|%=)\s*(.+);$/;
const TASK_UNTIL = /^task\.start\((.+?)\)\s+until\s+task\.repeated\((.+)\)\s*;$/;
const TARGET_RE = '[A-Za-z_]\\w*(?:\\.[A-Za-z_]\\w*|\\[.+\\])?';
const POSTFIX_STEP = new RegExp('^(' + TARGET_RE + ')\\s*(\\+\\+|--)\\s*;$');
const PREFIX_STEP = new RegExp('^(\\+\\+|--)\\s*(' + TARGET_RE + ')\\s*;$');

// attributes may be separated by commas or spaces; a bare name is a flag:  type="email" required
function parseAttrs(s) {
  const out = [];
  const text = s.trim().replace(/[\s,]+$/, '');
  const re = /\s*,?\s*([A-Za-z_][\w-]*)(?:\s*=\s*("(?:[^"\\]|\\.)*"|[^\s,]+))?/y;
  let pos = 0;
  while (pos < text.length) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m || re.lastIndex === pos) throw new CitError(`Invalid attribute near: ${text.slice(pos)}`);
    pos = re.lastIndex;
    out.push({ key: m[1], expr: m[2] !== undefined ? m[2].trim() : null });
  }
  return out;
}
async function evalAttrs(s, scope, ctx) {
  const o = {};
  for (const { key, expr } of parseAttrs(s)) o[key] = expr === null ? 'True' : fmt(await ev(parseExpr(expr), scope, ctx));
  return o;
}

async function execStmt(n, scope, ctx) {
  const t = n.text;
  let m;
  const value = async expr => {
    const ast = parseExpr(expr);
    const v = await ev(ast, scope, ctx);
    if (v === undefined) throw new CitError('A function that returns nothing cannot be used as a value.');
    return { ast, v };
  };
  if ((m = TASK_UNTIL.exec(t))) { // task.start(t()) until task.repeated(n);
    const { def, args } = await taskRef(parseExpr(m[1]), scope, ctx, true);
    await startTask(def, args, await repeatCount(parseExpr(m[2]), scope, ctx), ctx);
    return;
  }
  const stepOf = async (target, op) => { // i++;  ++i;  i--;  --i;   (numbers only)
    const cur = await ev(parseExpr(target), scope, ctx);
    if (typeof cur !== 'number') throw new CitError(`'${op}' needs a num, but '${target}' is a ${typeName(cur)}.`);
    return execStmt({ ...n, text: `${target} ${op[0]}= 1;` }, scope, ctx);
  };
  if ((m = POSTFIX_STEP.exec(t))) return stepOf(m[1], m[2]);
  if ((m = PREFIX_STEP.exec(t))) return stepOf(m[2], m[1]);
  if ((m = DECL.exec(t))) {
    const [, mod, type, name, expr] = m;
    if (scope.vars.has(name)) throw new CitError(`'${name}' is already declared.`);
    const { v } = await value(expr);
    if (!TYPE_OK[type](v)) throw new CitError(`'${name}' is declared as ${type} but got ${typeName(v)}.`);
    scope.vars.set(name, { mod, type, value: v });
  } else if ((m = INDEX_ASSIGN.exec(t))) {
    const [, name, idxExpr, op, expr] = m;
    const target = getVar(scope, name).value;
    if (target instanceof CitDict) {
      const key = await ev(parseExpr(idxExpr), scope, ctx);
      const { v: rhs } = await value(expr);
      if (op !== '=' && !target.map.has(key)) throw new CitError(`Key ${repr(key)} not found.`);
      target.map.set(key, op === '=' ? rhs : binop(op.slice(0, -1), target.map.get(key), rhs));
      return;
    }
    if (target instanceof EnumType) throw new CitError('Enums cannot be changed.');
    if (!(target instanceof CitList)) throw new CitError(`Cannot use [ ] on a ${typeName(target)}.`);
    if (target.tuple) throw new CitError('Tuples cannot be changed (they are immutable). Use a list [ ] if you need to change items.');
    const idx = toIndex(await ev(parseExpr(idxExpr), scope, ctx), target.items.length);
    const { v: rhs } = await value(expr);
    target.items[idx] = op === '=' ? rhs : binop(op.slice(0, -1), target.items[idx], rhs);
  } else if ((m = MEMBER_ASSIGN.exec(t))) {
    const [, oname, prop, op, expr] = m;
    const target = getVar(scope, oname).value;
    const { v: rhs } = await value(expr);
    if (target instanceof CitDict) {
      if (op !== '=' && !target.map.has(prop)) throw new CitError(`No key '${prop}' in '${oname}'.`);
      target.map.set(prop, op === '=' ? rhs : binop(op.slice(0, -1), target.map.get(prop), rhs));
    } else if (target instanceof EnumType) {
      throw new CitError('Enums cannot be changed.');
    } else if (target instanceof Instance) {
      let next = rhs;
      if (op !== '=') {
        if (!target.attrs.has(prop)) throw new CitError(`'${oname}' has no attribute '${prop}'.`);
        next = binop(op.slice(0, -1), target.attrs.get(prop), rhs);
      }
      target.attrs.set(prop, next);
    } else if (target instanceof UiElement && target.kind === 'input' && (prop === 'text' || prop === 'value')) {
      const next = op === '=' ? rhs : binop(op.slice(0, -1), target.value, rhs);
      target.value = fmt(next);
      if (ctx.io.uiValue) ctx.io.uiValue(target.name, target.value);
    } else if (target instanceof UiElement) {
      if (prop !== 'text') throw new CitError("Only '.text' can be changed on a ui element.");
      const next = op === '=' ? rhs : binop(op.slice(0, -1), target.text, rhs);
      target.text = fmt(next);
      target.log = [];
      if (ctx.io.uiUpdate) ctx.io.uiUpdate(target.name, target.text);
    } else {
      throw new CitError(`Cannot set '.${prop}' on ${typeName(target)}.`);
    }
  } else if ((m = ASSIGN.exec(t))) {
    const [, name, op, expr] = m;
    const v = getVar(scope, name);
    const { ast, v: rhs } = await value(expr);
    const next = op === '=' ? rhs : binop(op.slice(0, -1), v.value, rhs);
    if (op === '=' && ast.type === 'call' && CASTS.includes(ast.name)) v.type = typeName(next); // casting changes the type
    else if (!TYPE_OK[v.type](next)) throw new CitError(`'${name}' is ${v.type}, cannot assign ${typeName(next)}. Use parseInt/parseFloat/parseString/parseBool to convert.`);
    v.value = next;
  } else {
    const ast = parseExpr(t.slice(0, -1));
    if (ast.type !== 'call' && ast.type !== 'mcall') throw new CitError(`Unknown statement: ${t}`);
    // As a statement, a string method that gives a string changes the variable:  str.toUpperCase();
    if (ast.type === 'mcall' && ast.obj.type === 'var' && STRING_METHODS.includes(ast.name)) {
      const rec = getVar(scope, ast.obj.name);
      if (typeof rec.value === 'string') {
        const res = stringMethod(rec.value, ast.name, await evalArgs(ast.args, scope, ctx));
        if (typeof res === 'string') rec.value = res;
        return;
      }
    }
    await ev(ast, scope, ctx);
  }
}

const POINTER_EVENTS = ['hover', 'hoverEnd', 'active']; // mouse enters, mouse leaves, mouse button pressed
const ELEMENT_EVENTS = {
  button: ['clicked', ...POINTER_EVENTS], p: ['clicked', ...POINTER_EVENTS], h1: ['clicked', ...POINTER_EVENTS],
  h2: ['clicked', ...POINTER_EVENTS], h3: ['clicked', ...POINTER_EVENTS], codeOutput: ['clicked', ...POINTER_EVENTS],
  input: ['focus', 'focusEnd', 'typed', ...POINTER_EVENTS]
};

function toErrorValue(e) {
  if (e instanceof CitError) return new ErrorValue(e.kind || 'ErrUnknown', e.message, e.citLine == null ? 0 : e.citLine);
  if (e instanceof RaiseSignal) return new ErrorValue(e.name, `error.${e.name} was raised`, e.line);
  return null;
}

async function execNode(n, scope, ctx) {
  switch (n.type) {
    case 'stmt': return execStmt(n, scope, ctx);
    case 'import': case 'pass': case 'task': case 'uistyle': return undefined; // tasks and style sheets are registered before main runs
    case 'return': throw new ExitSignal(n.name);
    case 'break': throw new BreakSignal();
    case 'continue': throw new ContinueSignal();
    case 'retval': {
      const v = n.expr ? await ev(parseExpr(n.expr), scope, ctx) : null;
      if (v === undefined) throw new CitError('A function that returns nothing cannot be used as a value.');
      throw new ReturnSignal(v);
    }
    case 'raise': {
      if (n.body.length) await execBlock(n.body, new Scope(scope), ctx); // the block runs first, then the error is raised
      throw new RaiseSignal(n.name, n.line);
    }
    case 'enum': {
      if (scope.vars.has(n.name)) throw new CitError(`'${n.name}' is already declared.`);
      scope.vars.set(n.name, { mod: n.mod, type: 'enum', value: new EnumType(n.name, n.members) });
      return undefined;
    }
    case 'when': { // runs in the surrounding scope; the first matching case wins
      const subject = await ev(parseExpr(n.subject), scope, ctx);
      let matched = false;
      for (const it of n.body) {
        if (it.type !== 'case') { await execBlock([it], scope, ctx); continue; }
        if (matched) continue;
        let hit = true;
        if (it.cond !== null) {
          try {
            const v = await ev(parseExpr(it.cond), scope, ctx);
            hit = typeof v === 'boolean' ? v : equals(v, subject); // a non-bool case is compared with the subject
          } catch (e) { if (e instanceof CitError && e.citLine == null) e.citLine = it.line; throw e; }
        }
        if (hit) { matched = true; await execBlock([it.node], scope, ctx); }
      }
      return undefined;
    }
    case 'func': scope.funcs.set(n.name, { name: n.name, params: n.params, body: n.body, scope }); return undefined;
    case 'funcarg': { // a && b && c.event(func name() ... end);
      const tm = /^(.+)\.([A-Za-z_]\w*)$/.exec(n.target);
      const names = tm[1].split('&&').map(x => x.trim()), event = tm[2];
      const f = { name: n.name, params: n.params, body: n.body, scope };
      scope.funcs.set(n.name, f);
      if (n.params.length) throw new CitError('An event handler cannot take parameters.');
      for (const name of names) {
        const tv = getVar(scope, name).value;
        if (tv instanceof UiElement) {
          const allowed = ELEMENT_EVENTS[tv.kind] || [];
          if (!allowed.includes(event)) throw new CitError(`A ui.${tv.kind} ('${name}') has no '${event}' event. Events: ${allowed.join(', ')}.`);
          tv.handlers[event].push(f);
        } else if (tv instanceof UiRoot && event === 'closed') tv.handlers.closed.push(f);
        else throw new CitError(`'${name}.${event}' is not supported. Use <ui element>.${event}(func name() ... end); with a ui element${event === 'closed' ? ' or the ui root' : ''}.`);
      }
      return undefined;
    }
    case 'switch': {
      const subject = await ev(parseExpr(n.subject), scope, ctx);
      try { // break; leaves the switch
        for (const cs of n.cases) {
          for (const v of splitTopLevel(cs.values)) {
            let val;
            try { val = await ev(parseExpr(v), scope, ctx); }
            catch (e) { if (e instanceof CitError && e.citLine == null) e.citLine = cs.line; throw e; }
            if (equals(val, subject)) { await execBlock(cs.body, new Scope(scope), ctx); return undefined; }
          }
        }
        if (n.defaultBody) await execBlock(n.defaultBody, new Scope(scope), ctx);
      } catch (e) { if (!(e instanceof BreakSignal)) throw e; }
      return undefined;
    }
    case 'try': {
      try {
        try { await execBlock(n.tryBody, new Scope(scope), ctx); }
        catch (e) {
          const err = n.catchBody ? toErrorValue(e) : null; // only real errors are caught, not return/break/exit
          if (!err) throw e;
          const s2 = new Scope(scope);
          if (n.catchVar) s2.vars.set(n.catchVar, { mod: 'default', type: 'error', value: err });
          await execBlock(n.catchBody, s2, ctx);
        }
      } finally {
        if (n.finallyBody) await execBlock(n.finallyBody, new Scope(scope), ctx);
      }
      return undefined;
    }
    case 'if': {
      for (const b of n.branches) {
        let c;
        try { c = needBool(await ev(parseExpr(b.cond), scope, ctx), 'The condition'); }
        catch (e) { if (e instanceof CitError) e.citLine = b.line; throw e; }
        if (c) return execBlock(b.body, new Scope(scope), ctx);
      }
      if (n.elseBody) return execBlock(n.elseBody, new Scope(scope), ctx);
      return undefined;
    }
    case 'while': {
      const ast = parseExpr(n.cond);
      for (;;) {
        let c;
        try { c = needBool(await ev(ast, scope, ctx), 'The condition'); }
        catch (e) { if (e instanceof CitError) e.citLine = n.line; throw e; }
        if (!c) break;
        await tick(ctx);
        try { await execBlock(n.body, new Scope(scope), ctx); }
        catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
      }
      return undefined;
    }
    case 'for': {
      const from = await ev(parseExpr(n.from), scope, ctx);
      const to = await ev(parseExpr(n.to), scope, ctx);
      if (typeof from !== 'number' || typeof to !== 'number') throw new CitError('range needs two num values.');
      for (let k = from; k < to; k++) { // end is exclusive: range = 0, 3 -> 0, 1, 2
        await tick(ctx);
        const s = new Scope(scope);
        s.vars.set(n.v, { mod: 'default', type: 'num', value: k });
        try { await execBlock(n.body, s, ctx); }
        catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
      }
      return undefined;
    }
  }
  return undefined;
}

async function execBlock(list, scope, ctx) {
  for (const n of list) {
    const inst = als.getStore();
    if (inst && inst.stopped) throw new TaskStop();
    try { await execNode(n, scope, ctx); }
    catch (e) {
      if (e instanceof CitError && e.citLine == null) e.citLine = n.line;
      throw e;
    }
  }
}

function registerClass(n, root, ctx) {
  if (ctx.classes.has(n.name)) throw new CitError(`Class '${n.name}' is already declared.`, n.line);
  const cls = { name: n.name, parentName: n.parent, methods: new Map(), line: n.line };
  for (const f of n.body) {
    if (f.type === 'func') cls.methods.set(f.name, { name: f.name, params: f.params, body: f.body, scope: root, owner: cls });
  }
  ctx.classes.set(n.name, cls);
}
function registerTask(n, root, ctx) {
  if (ctx.tasks.has(n.name)) throw new CitError(`Task '${n.name}' is already declared.`, n.line);
  ctx.tasks.set(n.name, { name: n.name, params: n.params, body: n.body, scope: root });
}
function checkParents(n, ctx) {
  const seen = new Set([n.name]);
  let p = n.parent;
  while (p) {
    const pc = ctx.classes.get(p);
    if (!pc) throw new CitError(`Unknown parent class '${p}'.`, n.line);
    if (seen.has(p)) throw new CitError(`Class '${n.name}' has a circular inheritance chain.`, n.line);
    seen.add(p);
    p = pc.parentName;
  }
}

async function execUiRoot(n, root, fire, ctx) {
  try {
    const attrs = {};
    Object.assign(attrs, await evalAttrs(n.attrs, root, ctx));
    const ui = new UiRoot(n.name, attrs.title !== undefined ? attrs.title : 'CIT App', attrs);
    if (root.vars.has(n.name)) throw new CitError(`'${n.name}' is already declared.`, n.line);
    if (attrs['style-connect'] !== undefined) {
      const nm = attrs['style-connect'].replace(/\s*\(\s*\)\s*$/, '').trim();
      const sheet = ctx.styles.get(nm);
      if (!sheet) throw new CitError(`Unknown style sheet '${nm}'.`, n.line);
      try { ui.css = compileSheet(sheet); }
      catch (e) { if (e instanceof StyleError) throw new CitError(e.message, n.line); throw e; }
    }
    ctx.ui = ui;
    root.vars.set(n.name, { mod: 'default', type: 'ui', value: ui }); // lets you write main.closed(func ...)
    for (const e of n.body) {
      if (e.type !== 'uielem') continue;
      if (root.vars.has(e.name)) throw new CitError(`'${e.name}' is already declared.`, e.line);
      const eattrs = await evalAttrs(e.attrs, root, ctx);
      if (e.kind === 'input') {
        const types = ['text', 'password', 'email', 'number', 'search', 'tel', 'url'];
        if (eattrs.type !== undefined && !types.includes(eattrs.type)) throw new CitError(`ui.input type must be one of: ${types.join(', ')}.`, e.line);
        for (const k of ['minLength', 'maxLength']) {
          if (eattrs[k] !== undefined && !/^\d+$/.test(eattrs[k])) throw new CitError(`${k} must be a whole number.`, e.line);
        }
      }
      const text = await ev(parseExpr(e.text), root, ctx);
      const el = new UiElement(e.name, e.kind, eattrs, fmt(text));
      ui.elements.push(el);
      root.vars.set(e.name, { mod: 'default', type: 'ui', value: el });
    }
    if (ctx.io.uiReady) ctx.io.uiReady(ui, fire);
  } catch (e) {
    if (e instanceof CitError && e.citLine == null) e.citLine = n.line;
    throw e;
  }
}

// UI events. fire(name) = a click, fire.close() = the window was closed, fire.cancel() = stop everything.
// Each resolves to { error: null | { message, line } }; events are processed one at a time.
function makeFire(ctx) {
  const runList = async list => {
    try {
      for (const h of list) {
        ctx.steps = 0;
        try { await execBlock(h.body, new Scope(h.scope), ctx); }
        catch (e) { if (e instanceof ExitSignal || e instanceof ReturnSignal) break; throw e; }
      }
      return { error: null };
    } catch (e) {
      if (e instanceof RaiseSignal) {
        const msg = `error.${e.name} was raised`;
        failAll(ctx, { exit: e.name, error: { message: msg, line: e.line } });
        return { error: { message: msg, line: e.line } };
      }
      if (e instanceof CitError) return { error: { message: e.message, line: e.citLine == null ? 0 : e.citLine } };
      throw e;
    }
  };
  const enqueue = fn => {
    const job = ctx.queue.then(fn);
    ctx.queue = job.catch(() => {});
    return job;
  };
  // fire('btn') = click, fire('inp', 'focus'), fire('inp', 'focusEnd'), fire('inp', 'typed', 'text so far')
  const fire = (name, event = 'clicked', value) => enqueue(async () => {
    const el = ctx.ui && ctx.ui.elements.find(e => e.name === name);
    if (!el || stopped(ctx)) return { error: null };
    if (event === 'typed' && el.kind === 'input' && value !== undefined) el.value = String(value);
    return runList(el.handlers[event] || []);
  });
  fire.close = () => enqueue(async () => {
    if (!ctx.ui || ctx.closedFired) return { error: null };
    ctx.closedFired = true;
    return runList(ctx.ui.handlers.closed);
  });
  fire.cancel = () => { ctx.cancelled = true; };
  return fire;
}

// io = { write(line), input(prompt), sleep(ms)?, isCancelled()?, uiReady(ui, fire)?, uiUpdate(name, text)?, uiOutput(name, line)?, uiValue(name, value)? }
// Resolves to { exit, error, ui, fire }
async function run(text, io) {
  const bad = lint(text).filter(p => p.severity === 'error');
  if (bad.length) return { exit: 'ErrParsedLine', error: { message: bad[0].message, line: bad[0].line }, ui: null, fire: null };
  const ctx = { io, depth: 0, steps: 0, classes: new Map(), styles: new Map(), tasks: new Map(), taskInsts: new Set(), fatal: null, ui: null, cancelled: false, closedFired: false, queue: Promise.resolve() };
  const fire = makeFire(ctx);
  const root = new Scope(null);
  try {
    const top = build(text);
    for (const n of top) if (n.type === 'class') registerClass(n, root, ctx);
    for (const n of top) if (n.type === 'class') checkParents(n, ctx);
    for (const n of top) if (n.type === 'task') registerTask(n, root, ctx);
    for (const n of top) {
      if (n.type === 'import' && n.name === 'math') { // import math;  /  import math as m;
        const mod = new Module('math');
        root.vars.set('math', { mod: 'const', type: 'module', value: mod });
        if (n.alias) root.vars.set(n.alias, { mod: 'const', type: 'module', value: mod });
      }
    }
    for (const n of top) {
      if (n.type !== 'uistyle') continue;
      if (ctx.styles.has(n.name)) throw new CitError(`Style sheet '${n.name}' is already declared.`, n.line);
      ctx.styles.set(n.name, { rules: n.rules });
    }
    for (const n of top) if (n.type === 'uiroot') await execUiRoot(n, root, fire, ctx);
    for (const n of top) {
      if (n.type === 'main') {
        await execBlock(n.body, new Scope(root), ctx);
        await waitTasks(ctx); // the program lives on while tasks are still running
        if (ctx.fatal) return { exit: ctx.fatal.exit, error: ctx.fatal.error, ui: ctx.ui, fire };
      } else if (n.type === 'return') throw new ExitSignal(n.name);
    }
    return { exit: 'NoErr', error: null, ui: ctx.ui, fire };
  } catch (e) {
    if (e instanceof ExitSignal) { stopAllTasks(ctx); return { exit: e.name, error: null, ui: ctx.ui, fire }; }
    if (e instanceof RaiseSignal) {
      const fatal = { exit: e.name, error: { message: `error.${e.name} was raised`, line: e.line } };
      failAll(ctx, fatal);
      return { ...fatal, ui: ctx.ui, fire };
    }
    if (e instanceof CitError) stopAllTasks(ctx);
    if (e instanceof CitError) return { exit: e.kind || 'ErrUnknown', error: { message: e.message, line: e.citLine == null ? 0 : e.citLine }, ui: ctx.ui, fire };
    throw e;
  }
}

module.exports = { stripComment, classify, lint, closerFor, needsEnd, run, KNOWN_ERRORS };
