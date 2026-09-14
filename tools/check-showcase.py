#!/usr/bin/env python3
"""Check local links/assets in the public-facing documentation, without network I/O."""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DOCS = [ROOT / p for p in ('README.md', 'README.en.md', 'CONTRIBUTING.md', 'SECURITY.md', 'ROADMAP.md')]
DOCS += sorted((ROOT / 'docs/showcase').glob('*.md'))


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'img' and not attrs.get('alt', '').strip():
            self.errors.append('image needs descriptive alt text')
        for key in ('src', 'href'):
            if key in attrs:
                self.urls.append(attrs[key])


def main():
    errors, count = [], 0
    for doc in DOCS:
        text = doc.read_text(encoding='utf-8')
        # Ignore examples in fenced code blocks and inline code.
        prose = re.sub(r'```.*?```', '', text, flags=re.S)
        prose = re.sub(r'`[^`]+`', '', prose)
        parser = Links()
        parser.feed(prose)
        errors.extend(f'{doc.relative_to(ROOT)}: {e}' for e in parser.errors)
        urls = parser.urls + re.findall(r'!?\[[^\]]*\]\(([^\s)]+)\)', prose)
        for url in urls:
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            target = (doc.parent / unquote(parsed.path)).resolve()
            if not target.is_relative_to(ROOT):
                errors.append(f'{doc.relative_to(ROOT)}: link escapes repository: {url}')
            elif not target.exists():
                errors.append(f'{doc.relative_to(ROOT)}: missing local target: {url}')
            count += 1
    for asset in (ROOT / 'images/showcase').glob('*.svg'):
        try:
            ET.parse(asset)
        except ET.ParseError as exc:
            errors.append(f'{asset.relative_to(ROOT)}: invalid SVG: {exc}')
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print(f'Showcase checks passed: {len(DOCS)} documents, {count} local links, valid SVG assets.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
