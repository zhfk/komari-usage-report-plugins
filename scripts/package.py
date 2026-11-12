from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json, hashlib
manifest=json.loads(Path('dist/komari-plugin.json').read_text())
root=Path('artifacts'); root.mkdir(exist_ok=True)
output=root/f"{manifest['short']}-{manifest['version']}.zip"
with ZipFile(output,'w',ZIP_DEFLATED) as z:
    for p in sorted(Path('dist').rglob('*')):
        if p.is_file(): z.write(p,p.relative_to('dist').as_posix())
with ZipFile(output) as z:
    assert {'komari-plugin.json','script.js'}.issubset(z.namelist())
    assert not any(name.lower().endswith(('.html','.htm')) for name in z.namelist())
    assert not manifest.get('pages')
    assert z.testzip() is None
(root/'SHA256SUMS').write_text(f'{hashlib.sha256(output.read_bytes()).hexdigest()}  {output.name}\n')
print(output)
