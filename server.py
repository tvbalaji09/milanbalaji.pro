import argparse
import datetime
import json
import os
from pathlib import Path
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
ROOT = Path(__file__).resolve().parent
LEGACY_CATEGORIES = ('reading', 'academics', 'exercise')
CATEGORIES = LEGACY_CATEGORIES + ('family_fun', 'guitar', 'journal')
JOURNAL_FIELDS = ('mood', 'tomorrow_goal', 'thankful', 'challenge', 'proud')
def validate_date(date):
    parsed = datetime.date.fromisoformat(date)
    if parsed.isoformat() != date or parsed > datetime.date.today():
        raise ValueError('Dates must be past or current dates.')
def initial():
    return {'version': 3, 'children': [{'id': f'child-{i}', 'name': f'Child {i}', 'days': {}, 'entries': {}} for i in (1, 2)]}
def validate(data):
    if not isinstance(data, dict) or data.get('version') not in (1, 2, 3) or not isinstance(data.get('children'), list) or len(data['children']) != 2:
        raise ValueError('Expected a version 1, 2 or 3 backup with two children.')
    clean = initial()
    for i, child in enumerate(data['children']):
        if not isinstance(child, dict) or child.get('id') != f'child-{i+1}':
            raise ValueError('Invalid child identifiers or order.')
        name, days = child.get('name'), child.get('days')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 60 or not isinstance(days, dict):
            raise ValueError('Names must contain 1–60 characters; days must be an object.')
        result = {}
        for date, values in days.items():
            validate_date(date)
            expected = set(LEGACY_CATEGORIES if data['version'] == 1 else CATEGORIES)
            if not isinstance(values, dict) or set(values) != expected:
                raise ValueError('Each day must contain the activities for its backup version.')
            if any(type(v) is not int or not 0 <= v <= 1440 for v in values.values()) or sum(values.values()) > 1440:
                raise ValueError('Minutes must be whole numbers totaling at most 1440 per day.')
            result[date] = {key: values.get(key, 0) for key in CATEGORIES}
        entries = child.get('entries') if data['version'] == 3 else {}
        if not isinstance(entries, dict):
            raise ValueError('Journal entries must be an object.')
        journal = {}
        for date, entry in entries.items():
            validate_date(date)
            if not isinstance(entry, dict) or set(entry) != set(JOURNAL_FIELDS):
                raise ValueError('Journal entries must contain all five prompts.')
            if any(not isinstance(value, str) or len(value) > 2000 for value in entry.values()):
                raise ValueError('Each journal answer must be text of at most 2000 characters.')
            journal[date] = {key: entry[key] for key in JOURNAL_FIELDS}
        clean['children'][i].update(name=name.strip(), days=result, entries=journal)
    return clean
class Store:
    def __init__(self, path):
        self.path, self.lock = Path(path), threading.Lock()
        if self.path.exists():
            self.data = validate(json.loads(self.path.read_text()))
        else:
            self.save(initial())
    def save(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix='.activities-', dir=self.path.parent)
        try:
            with os.fdopen(fd, 'w') as stream:
                json.dump(data, stream, indent=2)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
            directory = os.open(self.path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
            self.data = data
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'public'), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
    def reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if self.path == '/api/activities':
            with self.server.store.lock:
                self.reply(200, self.server.store.data)
        elif self.path in ('/', '/kids-activity.html', '/app.js', '/styles.css'):
            if self.path == '/': self.path = '/kids-activity.html'
            super().do_GET()
        else:
            self.send_error(404)
    def do_POST(self):
        if self.path != '/api/activities':
            self.send_error(404)
            return
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            self.reply(403, {'error': 'Cross-origin writes forbidden.'})
            return
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            self.reply(415, {'error': 'Use application/json.'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 5_000_000: raise ValueError('Backup must be 1 byte to 5 MB.')
            data = validate(json.loads(self.rfile.read(size)))
            with self.server.store.lock: self.server.store.save(data)
            self.reply(200, data)
        except (ValueError, TypeError, UnicodeError) as error:
            self.reply(400, {'error': str(error)})
        except OSError:
            self.reply(500, {'error': 'Could not save. Check disk space and permissions.'})
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=8000, type=int)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.store = Store(ROOT / 'data' / 'activities.json')
    print(f'Activity tracker: http://{args.host}:{server.server_port}', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
if __name__ == '__main__': main()
