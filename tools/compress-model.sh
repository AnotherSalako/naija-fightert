#!/bin/bash
# Shrink a built character GLB: drop redundant animation keys (clips share one 60 fps timeline, so
# 30 fps Mixamo clips carry in-between keys), then Draco the mesh. Usage: tools/compress-model.sh egbon-razak
set -e
id="$1"; f="public/models/$id.glb"; t="$(mktemp -d)"
npx --yes @gltf-transform/cli resample "$f" "$t/rs.glb" --tolerance 0.0005
npx --yes @gltf-transform/cli draco "$t/rs.glb" "$f" --quantize-position 14 --quantize-normal 10 --quantize-texcoord 12
python3 - "$id" <<'PY'
import json, os, sys
p = f'public/models/{sys.argv[1]}.json'; d = json.load(open(p))
d['bytes'] = os.path.getsize(f'public/models/{sys.argv[1]}.glb')
open(p, 'w').write(json.dumps(d, indent=2) + '\n'); print(d['bytes'])
PY
