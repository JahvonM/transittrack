cd "$(dirname "$0")/.."
echo "== routes"; grep -oE 'path="[^"]+"' src/App.jsx | sort | tr '\n' ' '; echo
echo "== pages without a route"; for f in src/pages/*.jsx; do n=$(basename "$f" .jsx); grep -q "pages/$n'" src/App.jsx || grep -q "pages/$n\"" src/App.jsx || echo "  $n"; done
echo "== components imported nowhere"; for f in $(find src/components -name '*.jsx' -not -path '*/ui/*'); do n=$(basename "$f" .jsx); c=$(grep -rlE "components/([a-z]+/)?$n[\"']|/$n[\"']|\\./$n[\"']" src --include=*.jsx --include=*.js | grep -v "$f" | wc -l); [ "$c" = 0 ] && echo "  $f"; done
echo "== plain 'Loading…' texts"; grep -rn "Loading…\|Loading\.\.\." --include=*.jsx src | grep -v components/ui | wc -l
echo "== window.alert / confirm"; grep -rnE "\balert\(|window\.confirm|\bconfirm\(" --include=*.jsx src | wc -l
echo "== console.log"; grep -rn "console.log" --include=*.jsx --include=*.js src | wc -l
echo "== .then without catch (rough)"; grep -rn "\.then(" --include=*.jsx src | grep -v "catch" | wc -l
echo "== TODO/FIXME"; grep -rnE "TODO|FIXME|XXX" --include=*.jsx --include=*.js src | head -8
echo "== eslint summary"; npx eslint src 2>&1 | tail -2
echo "== biggest bundles"; ls -S -l dist/assets/*.js | head -6 | awk '{print $5, $9}'
echo "== title / branding"; grep -o "<title>[^<]*" index.html; grep -E '"(name|short_name|theme_color|background_color)"' public/manifest.webmanifest; grep -n backgroundColor capacitor.config.json
echo "== driver next stop logic"; grep -n "return ordered\[0\]" src/components/driver/DriverNavMap.jsx
echo "== hardcoded secrets-ish"; grep -rnoE "pk\.[A-Za-z0-9]{20}|VAPID_KEY *= *\"[^\"]{10}" src | head
echo "== entity list calls with no limit"; grep -rnoE "entities\.[A-Za-z]+\.list\(\)" --include=*.jsx src | wc -l
echo "== emoji in UI"; grep -rnoP "[\x{1F300}-\x{1FAFF}]" --include=*.jsx src | wc -l
echo "== pages"; ls src/pages | wc -l; echo "== functions"; ls base44/functions | tr '\n' ' '; echo
echo "== entities"; ls base44/entities 2>/dev/null | tr '\n' ' '
