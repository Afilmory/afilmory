#!/bin/bash
set -e
cd ../web
pnpm build

rm -rf ../ssr/public
cp -r dist ../ssr/public
# Copy repository photos into SSR public so Next.js can serve /photos/* in production
# If the photos directory does not exist, continue without failing the build
if [ -d "../../photos" ]; then
	echo "Copying photos/ -> ../ssr/public/photos"
	rm -rf ../ssr/public/photos
	cp -r ../../photos ../ssr/public/photos
else
	echo "No photos/ directory found at repository root; skipping copy."
fi
cd ../ssr
# Convert HTML to JS format with exported string
node -e "
const fs = require('fs');
const html = fs.readFileSync('./public/index.html', 'utf8');
const jsContent = \`export default \\\`\${html.replace(/\`/g, '\\\\\`').replace(/\\\$/g, '\\\\\$')}\\\`;\`;
fs.writeFileSync('./src/index.html.ts', jsContent);
"
rm ./public/index.html
# pnpm build:jpg
pnpm build:next
