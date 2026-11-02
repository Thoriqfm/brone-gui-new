"""Read-only inventory: python scripts/analyze-eye-assets.py (from frontend)."""
import hashlib
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET


def inventory():
    assets = []
    for path in sorted(Path('public/assets/face-layers/eyes').rglob('*.svg')):
        root = ET.parse(path).getroot()
        def node(element):
            return {'tag': element.tag.split('}')[-1], 'attributes': element.attrib,
                    'children': [node(child) for child in element]}
        paths = [e.get('d') for e in root.iter() if e.tag.endswith('}path')]
        assets.append({'file': path.as_posix(), 'expression': path.name.split('-eye-')[0],
                       'side': path.parent.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                       'pathCommands': [re.findall(r'[A-DF-Za-df-z]', d) for d in paths],
                       'svg': node(root)})
    return assets


if __name__ == '__main__':
    print(json.dumps(inventory(), indent=2))
