const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', '.next', 'standalone');
const targetDir = path.join(__dirname, '..', '.standalone-build');
const staticSource = path.join(__dirname, '..', '.next', 'static');
const publicSource = path.join(__dirname, '..', 'public');

// Remove existing target
if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true });
}

console.log('Preparing standalone build with dereferenced symlinks...');

// Copy recursively, dereferencing symlinks and skipping broken ones
function copyRecursive(src, dest) {
  let stat;
  try {
    stat = fs.lstatSync(src);
  } catch (e) {
    return; // Skip if can't stat
  }

  if (stat.isSymbolicLink()) {
    // Try to resolve the symlink
    let realPath;
    try {
      realPath = fs.realpathSync(src);
    } catch (e) {
      // Broken symlink - skip
      return;
    }
    // Copy the target of the symlink
    copyRecursive(realPath, dest);
  } else if (stat.isDirectory()) {
    // Skip dist directory to avoid including previous Electron builds
    const basename = path.basename(src);
    if (basename === 'dist' || basename === '.standalone-build') {
      return;
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Copy standalone folder
copyRecursive(sourceDir, targetDir);

// Fix pnpm structure: copy packages from .pnpm to top-level node_modules
// Next.js expects packages like styled-jsx at node_modules/styled-jsx
const pnpmDir = path.join(targetDir, 'node_modules', '.pnpm');
const nodeModulesDir = path.join(targetDir, 'node_modules');

if (fs.existsSync(pnpmDir)) {
  console.log('Flattening pnpm node_modules structure...');

  // Find all packages in .pnpm and copy their node_modules content to top level
  for (const pkgDir of fs.readdirSync(pnpmDir)) {
    if (pkgDir === 'node_modules') continue;

    const pkgNodeModules = path.join(pnpmDir, pkgDir, 'node_modules');
    if (fs.existsSync(pkgNodeModules)) {
      for (const moduleName of fs.readdirSync(pkgNodeModules)) {
        const srcModule = path.join(pkgNodeModules, moduleName);
        const destModule = path.join(nodeModulesDir, moduleName);

        // Skip if already exists at top level or is a symlink
        if (fs.existsSync(destModule)) continue;

        const stat = fs.lstatSync(srcModule);
        if (stat.isDirectory()) {
          copyRecursive(srcModule, destModule);
        }
      }
    }
  }
}

// Copy static files to .next/static
const staticTarget = path.join(targetDir, '.next', 'static');
copyRecursive(staticSource, staticTarget);

// Copy public folder
const publicTarget = path.join(targetDir, 'public');
if (fs.existsSync(publicSource)) {
  copyRecursive(publicSource, publicTarget);
}

console.log('Standalone build prepared at:', targetDir);
