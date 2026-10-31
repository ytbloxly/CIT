'use strict';
/*
 * ipcit — the CIT package manager.
 *
 *   ipcit init [name]              create ipcit.json
 *   ipcit install [pkg[@ver]|path] install a package (or everything in ipcit.json)
 *   ipcit uninstall <pkg>          remove a package
 *   ipcit list                     show installed packages
 *   ipcit search [term]            search the package registry
 *   ipcit info <pkg>               show details about a package
 *
 * Project layout:
 *   ipcit.json        manifest  { name, version, description, main, dependencies }
 *   cit_packages/     installed packages, one folder per package
 *
 * Registry layout (packages are added here later):
 *   registry/packages/<name>/<version>/ipcit.json
 *   registry/packages/<name>/<version>/main.cit   (or whatever "main" says)
 *
 * In CIT code:  import "name"   or   import "name" as alias
 */

const fs = require('fs');
const path = require('path');

const VERSION = '0.1.0';
const MANIFEST = 'ipcit.json';
const MODULES_DIR = 'cit_packages';
const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const COPY_SKIP = new Set([MODULES_DIR, '.git', 'node_modules']);

class IpcitError extends Error {}

/* ---------- helpers ---------- */

const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function registryDir() {
  return process.env.IPCIT_REGISTRY || path.join(__dirname, '..', 'registry', 'packages');
}

function readManifest(dir) {
  const file = path.join(dir, MANIFEST);
  if (!isFile(file)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('not an object');
    return m;
  } catch (err) {
    throw new IpcitError(`Could not read ${file}: ${err.message}`);
  }
}

function writeManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function parseSpec(spec) {
  const at = spec.lastIndexOf('@');
  if (at <= 0) return { name: spec, version: null };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) || null };
}

function looksLikePath(spec) {
  return spec === '.' || spec === '..' || /^(\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])/.test(spec);
}

function checkName(name) {
  if (!NAME_RE.test(name)) {
    throw new IpcitError(`Invalid package name '${name}'. Use lowercase letters, digits, '.', '-' or '_'.`);
  }
}

/* ---------- registry ---------- */

function registryPackages() {
  const root = registryDir();
  const out = {};
  if (!isDir(root)) return out;
  for (const name of fs.readdirSync(root)) {
    if (!NAME_RE.test(name) || !isDir(path.join(root, name))) continue;
    const versions = fs.readdirSync(path.join(root, name))
      .filter(v => isFile(path.join(root, name, v, MANIFEST)))
      .sort(compareVersions);
    if (versions.length) out[name] = versions;
  }
  return out;
}

function registryLookup(name, version) {
  checkName(name);
  const all = registryPackages();
  const versions = all[name];
  if (!versions) {
    const count = Object.keys(all).length;
    throw new IpcitError(count === 0
      ? `Package '${name}' was not found. The registry has no packages yet — packages will be added later. ` +
        `To install from a folder instead, use: ipcit install ./path/to/package`
      : `Package '${name}' was not found in the registry. Try: ipcit search`);
  }
  const wanted = !version || version === 'latest' || version === '*' ? versions[versions.length - 1] : version;
  if (!versions.includes(wanted)) {
    throw new IpcitError(`Version '${wanted}' of '${name}' was not found. Available: ${versions.join(', ')}`);
  }
  return { name, version: wanted, dir: path.join(registryDir(), name, wanted) };
}

/* ---------- install / uninstall ---------- */

function copyPackage(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    filter: s => !COPY_SKIP.has(path.basename(s)) || path.resolve(s) === path.resolve(src)
  });
}

// Installs one package (and its dependencies) into <root>/cit_packages.
// Returns { name, version, saved } where `saved` is the value to record in ipcit.json.
function installOne(ctx, spec, fromDir, seen) {
  let name, version, srcDir, saved;
  if (looksLikePath(spec)) {
    srcDir = path.resolve(fromDir, spec);
    if (!isDir(srcDir)) throw new IpcitError(`Folder not found: ${srcDir}`);
    if (srcDir === path.resolve(ctx.root)) throw new IpcitError('Cannot install a project into itself.');
    const m = readManifest(srcDir);
    if (!m) throw new IpcitError(`${srcDir} has no ${MANIFEST}. Run 'ipcit init' inside that folder first.`);
    if (!m.name) throw new IpcitError(`${path.join(srcDir, MANIFEST)} is missing "name".`);
    name = String(m.name); checkName(name);
    version = String(m.version || '0.0.0');
    saved = 'file:' + path.relative(ctx.root, srcDir).split(path.sep).join('/');
  } else {
    const p = parseSpec(spec);
    const found = registryLookup(p.name, p.version);
    name = found.name; version = found.version; srcDir = found.dir; saved = version;
  }
  if (seen.has(name)) return { name, version, saved };
  seen.add(name);

  copyPackage(srcDir, path.join(ctx.root, MODULES_DIR, name));
  ctx.log('ok', `+ ${name}@${version}`);

  const deps = (readManifest(srcDir) || {}).dependencies || {};
  for (const [dep, range] of Object.entries(deps)) {
    if (seen.has(dep)) continue;
    installOne(ctx, depSpec(dep, range), srcDir, seen);
  }
  return { name, version, saved };
}

function depSpec(name, range) {
  return String(range).startsWith('file:') ? range.slice(5) : `${name}@${range}`;
}

function cmdInstall(ctx, args) {
  const manifest = readManifest(ctx.root);
  const seen = new Set();
  if (!args.length) {
    if (!manifest) throw new IpcitError(`No ${MANIFEST} found. Run 'ipcit init' first, or name a package: ipcit install <name>`);
    const deps = Object.entries(manifest.dependencies || {});
    if (!deps.length) { ctx.log('out', 'No dependencies listed in ipcit.json. Nothing to install.'); return 0; }
    for (const [name, range] of deps) installOne(ctx, depSpec(name, range), ctx.root, seen);
    ctx.log('ok', `Installed ${seen.size} package${seen.size === 1 ? '' : 's'}.`);
    return 0;
  }
  const results = args.map(a => installOne(ctx, a, ctx.cwd, seen));
  if (manifest) {
    manifest.dependencies = manifest.dependencies || {};
    for (const r of results) manifest.dependencies[r.name] = r.saved;
    writeManifest(ctx.root, manifest);
  } else {
    ctx.log('warn', `No ${MANIFEST} here, so the install was not recorded. Run 'ipcit init' to track dependencies.`);
  }
  return 0;
}

function cmdUninstall(ctx, args) {
  if (!args.length) throw new IpcitError('Usage: ipcit uninstall <package>');
  const manifest = readManifest(ctx.root);
  for (const name of args) {
    checkName(name);
    const dir = path.join(ctx.root, MODULES_DIR, name);
    const had = isDir(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    const listed = manifest && manifest.dependencies && name in manifest.dependencies;
    if (listed) delete manifest.dependencies[name];
    if (!had && !listed) ctx.log('warn', `'${name}' is not installed.`);
    else ctx.log('ok', `- ${name}`);
  }
  if (manifest) writeManifest(ctx.root, manifest);
  return 0;
}

/* ---------- other commands ---------- */

function cmdInit(ctx, args) {
  if (readManifest(ctx.root)) throw new IpcitError(`${MANIFEST} already exists here.`);
  let name = args[0] || path.basename(ctx.root);
  name = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'my-cit-project';
  checkName(name);
  writeManifest(ctx.root, { name, version: '0.1.0', description: '', main: 'main.cit', dependencies: {} });
  ctx.log('ok', `Created ${MANIFEST} for '${name}'.`);
  return 0;
}

function installedPackages(root) {
  const dir = path.join(root, MODULES_DIR);
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir).filter(n => isDir(path.join(dir, n))).sort().map(n => {
    let m = null; try { m = readManifest(path.join(dir, n)); } catch { /* ignore */ }
    return { name: n, version: m && m.version ? String(m.version) : '?', description: m && m.description ? String(m.description) : '' };
  });
}

function cmdList(ctx) {
  const installed = installedPackages(ctx.root);
  const manifest = readManifest(ctx.root);
  if (!installed.length) ctx.log('out', 'No packages installed.');
  for (const p of installed) ctx.log('out', `${p.name}@${p.version}${p.description ? '  - ' + p.description : ''}`);
  if (manifest && manifest.dependencies) {
    const have = new Set(installed.map(p => p.name));
    for (const n of Object.keys(manifest.dependencies)) {
      if (!have.has(n)) ctx.log('warn', `${n} is listed in ${MANIFEST} but not installed. Run: ipcit install`);
    }
  }
  return 0;
}

function cmdSearch(ctx, args) {
  const term = (args[0] || '').toLowerCase();
  const all = registryPackages();
  const names = Object.keys(all).filter(n => n.includes(term)).sort();
  if (!Object.keys(all).length) { ctx.log('out', 'The registry has no packages yet. Packages will be added later.'); return 0; }
  if (!names.length) { ctx.log('out', `No packages match '${term}'.`); return 0; }
  for (const n of names) {
    const latest = all[n][all[n].length - 1];
    const m = readManifest(path.join(registryDir(), n, latest)) || {};
    ctx.log('out', `${n}@${latest}${m.description ? '  - ' + m.description : ''}`);
  }
  return 0;
}

function cmdInfo(ctx, args) {
  if (!args.length) throw new IpcitError('Usage: ipcit info <package>');
  const p = parseSpec(args[0]);
  const found = registryLookup(p.name, p.version);
  const m = readManifest(found.dir) || {};
  const all = registryPackages()[p.name];
  ctx.log('out', `${found.name}@${found.version}`);
  if (m.description) ctx.log('out', m.description);
  ctx.log('out', `main: ${m.main || 'main.cit'}`);
  ctx.log('out', `versions: ${all.join(', ')}`);
  const deps = Object.keys(m.dependencies || {});
  if (deps.length) ctx.log('out', `dependencies: ${deps.join(', ')}`);
  return 0;
}

const HELP = [
  `ipcit ${VERSION} - the CIT package manager`,
  '',
  'Usage: ipcit <command> [arguments]',
  '',
  'Commands:',
  '  init [name]               Create an ipcit.json in the current folder',
  '  install [pkg[@version]]   Install a package, or everything in ipcit.json (alias: i, add)',
  '  install ./path            Install a package from a local folder',
  '  uninstall <pkg>           Remove a package (alias: remove, rm)',
  '  list                      List installed packages (alias: ls)',
  '  search [term]             Search the registry',
  '  info <pkg>                Show details about a registry package',
  '  help                      Show this help',
  '  version                   Show the ipcit version',
  '',
  'Use a package in CIT code:  import "name"   or   import "name" as alias'
];

/* ---------- entry point ---------- */

// execute(argv, { cwd, log }) -> exit code. `log(kind, message)` where kind is
// 'out' | 'ok' | 'warn' | 'error'; the caller decides how to colour each kind.
function execute(argv, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const log = options.log || ((kind, msg) => console.log(msg));
  const [cmd, ...args] = argv;
  const ctx = { cwd, root: cwd, log };
  try {
    switch (cmd) {
      case undefined: case 'help': case '--help': case '-h': HELP.forEach(l => log('out', l)); return 0;
      case 'version': case '--version': case '-v': log('out', `ipcit ${VERSION}`); return 0;
      case 'init': return cmdInit(ctx, args);
      case 'install': case 'i': case 'add': return cmdInstall(ctx, args);
      case 'uninstall': case 'remove': case 'rm': return cmdUninstall(ctx, args);
      case 'list': case 'ls': return cmdList(ctx);
      case 'search': return cmdSearch(ctx, args);
      case 'info': return cmdInfo(ctx, args);
      default:
        log('error', `Unknown command '${cmd}'. Run 'ipcit help' to see what is available.`);
        return 1;
    }
  } catch (err) {
    if (err instanceof IpcitError) { log('error', err.message); return 1; }
    log('error', `ipcit failed: ${err.message}`);
    return 1;
  }
}

/* ---------- used by the CIT interpreter for `import` ---------- */

function resolveModule(spec, fromDir) {
  const base = path.resolve(fromDir || process.cwd());
  const load = file => ({ source: fs.readFileSync(file, 'utf8'), filename: file, dir: path.dirname(file) });

  if (looksLikePath(spec)) {
    const target = path.resolve(base, spec);
    for (const c of [target, target + '.cit', target + '.ct', path.join(target, 'main.cit')]) {
      if (isFile(c)) return load(c);
    }
    throw new Error(`Cannot find file '${spec}'.`);
  }
  if (!NAME_RE.test(spec)) throw new Error(`'${spec}' is not a valid package name.`);

  for (let dir = base; ; ) {
    const pkgDir = path.join(dir, MODULES_DIR, spec);
    if (isDir(pkgDir)) {
      let main = 'main.cit';
      try { const m = readManifest(pkgDir); if (m && m.main) main = String(m.main); } catch { /* use default */ }
      const entry = path.resolve(pkgDir, main);
      if (!entry.startsWith(pkgDir + path.sep)) throw new Error(`Package '${spec}' has an invalid "main" entry.`);
      if (!isFile(entry)) throw new Error(`Package '${spec}' has no entry file '${main}'.`);
      return load(entry);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Package '${spec}' is not installed. Run: ipcit install ${spec}`);
}

module.exports = { VERSION, MANIFEST, MODULES_DIR, execute, resolveModule, registryDir, registryPackages };
