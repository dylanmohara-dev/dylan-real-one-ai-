#!/bin/zsh -l
# Runs the Dylan AI backend (serving the built dist/ if present) so it can
# be launched by macOS at login instead of needing `npm run dev` typed by
# hand every day. "-l" makes this a login shell so it picks up the normal
# PATH (Homebrew, nvm, etc.) the same way a Terminal window would, without
# this script needing to know exactly where node/ollama live on this Mac.
#
# This does NOT start Ollama -- if you installed the Ollama.app, turn on
# its own "Open at Login" toggle in Ollama > Settings instead of scripting
# around it here; it already does this correctly on its own.

cd "/Users/dylan/dylan-ai/app" || exit 1

# Rebuild only if dist/ is missing or older than the source -- avoids a
# multi-second rebuild on every single login when nothing changed.
if [ ! -f "dist/index.html" ] || [ "server.js" -nt "dist/index.html" ] || find src -newer dist/index.html -print -quit | grep -q .; then
  npm run build
fi

exec node server.js
