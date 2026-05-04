/**
 * copy-gsap.js
 * Copies the GSAP minified bundle from node_modules to public/js
 * so it can be served as a static asset without a CDN dependency.
 * Automatically run via the "postinstall" npm script.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'gsap', 'dist', 'gsap.min.js');
const dest = path.join(__dirname, '..', 'public', 'js', 'gsap.min.js');

try {
  fs.copyFileSync(src, dest);
  console.log('✅ GSAP copied to public/js/gsap.min.js');
} catch (err) {
  console.error('⚠️  Could not copy GSAP:', err.message);
  // Non-fatal: a previously committed copy may already exist
}
