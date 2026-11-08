import argparse
import re
from urllib.parse import urlsplit, parse_qs, quote
from urllib.request import urlopen, Request
from urllib.error import HTTPError
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
    return {'version': 4, 'children': [{'id': f'child-{i}', 'name': f'Child {i}', 'days': {}, 'entries': {}, 'words': {}} for i in (1, 2)]}
def validate(data):
    if not isinstance(data, dict) or data.get('version') not in (1, 2, 3, 4) or not isinstance(data.get('children'), list) or len(data['children']) != 2:
        raise ValueError('Expected a version 1, 2, 3 or 4 backup with two children.')
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
        entries = child.get('entries') if data['version'] >= 3 else {}
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
        source_words = child.get('words') if data['version'] >= 4 else {}
        if not isinstance(source_words, dict): raise ValueError('Word collections must be an object.')
        words = {}
        for date, items in source_words.items():
            validate_date(date)
            validate_items(items)
            for item in items:
                if set(item) != {'id', 'word', 'meaning'} or not valid_id(item['id']) or not isinstance(item['word'], str) or not item['word'].strip() or len(item['word']) > 80 or not isinstance(item['meaning'], str) or not item['meaning'].strip() or len(item['meaning']) > 2000:
                    raise ValueError('Each word needs an id, word (80 characters max), and meaning (2000 characters max).')
            words[date] = [dict(id=item['id'], word=item['word'].strip(), meaning=item['meaning'].strip()) for item in items]
        clean['children'][i].update(name=name.strip(), days=result, entries=journal, words=words)
    return clean
EXPENSE_CATEGORIES = ('Food', 'Travel', 'Shopping', 'Home', 'Fun', 'Other')
def valid_id(value):
    return isinstance(value, str) and re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', value) is not None
def validate_items(items):
    if not isinstance(items, list) or len(items) > 100 or any(not isinstance(item, dict) or not valid_id(item.get('id')) for item in items) or len({item['id'] for item in items}) != len(items):
        raise ValueError('Use at most 100 uniquely identified entries per day.')
def validate_money(source, diesel=False):
    if not isinstance(source, dict): raise ValueError('Spending collections must be an object.')
    result = {}
    for date, items in source.items():
        validate_date(date)
        validate_items(items)
        for item in items:
            amount = item.get('amount_pence')
            if type(amount) is not int or not 1 <= amount <= 99999999: raise ValueError('Amounts must be between £0.01 and £999,999.99.')
            if diesel:
                if set(item) != {'id', 'amount_pence'}: raise ValueError('Invalid diesel entry.')
            elif set(item) != {'id', 'description', 'category', 'amount_pence'} or not isinstance(item['description'], str) or not item['description'].strip() or len(item['description']) > 120 or item['category'] not in EXPENSE_CATEGORIES:
                raise ValueError('Add a description (120 characters max) and valid category.')
        result[date] = [dict(item) for item in items]
    return result

BALAJI_GOALS = ('connect', 'move', 'health', 'learn')
HEALTH_CHECKS = ('diet', 'medicine', 'supplements', 'skin_care')
BALAJI_FIELDS = ('mood_energy', 'win', 'work_learning', 'health_fitness', 'gratitude', 'tomorrow_priority')
def initial_balaji():
    return dict(version=2, name='Balaji', days={}, entries={}, expenses={}, diesel={}, health_checks={}, priority_done={})
def validate_balaji(data):
    if not isinstance(data, dict) or data.get('version') not in (1, 2) or data.get('name') != 'Balaji' or not isinstance(data.get('days'), dict) or not isinstance(data.get('entries'), dict):
        raise ValueError('Expected a Balaji version 1 or 2 backup.')
    clean = initial_balaji()
    for date, values in data['days'].items():
        validate_date(date)
        if not isinstance(values, dict) or set(values) != set(BALAJI_GOALS) or any(type(value) is not bool for value in values.values()):
            raise ValueError('Each day needs four true/false goals.')
        clean['days'][date] = dict(values)
    for date, entry in data['entries'].items():
        validate_date(date)
        if not isinstance(entry, dict) or set(entry) != set(BALAJI_FIELDS) or any(not isinstance(value, str) or len(value) > 2000 for value in entry.values()):
            raise ValueError('Each journal needs six text answers, at most 2000 characters each.')
        clean['entries'][date] = dict(entry)
    clean['expenses'] = validate_money(data.get('expenses') if data['version'] == 2 else {})
    clean['diesel'] = validate_money(data.get('diesel') if data['version'] == 2 else {}, True)
    checks_by_date = data.get('health_checks', {})
    if not isinstance(checks_by_date, dict): raise ValueError('Health checks must be an object.')
    for date, checks in checks_by_date.items():
        validate_date(date)
        if not isinstance(checks, dict) or set(checks) != set(HEALTH_CHECKS) or any(type(value) is not bool for value in checks.values()): raise ValueError('Each health log needs four true/false checks.')
        if date not in clean['days'] or clean['days'][date]['health'] != all(checks.values()): raise ValueError('Health completion must match its four routine checks.')
        clean['health_checks'][date] = dict(checks)
    source_done = data.get('priority_done', {})
    if not isinstance(source_done, dict): raise ValueError('Priority completion must be an object.')
    for date, items in source_done.items():
        validate_date(date)
        if not isinstance(items, list) or len(items) > 100 or any(not isinstance(item, str) or not item.strip() or len(item) > 2000 for item in items) or len(set(items)) != len(items): raise ValueError('Priority completion needs up to 100 unique task texts.')
        clean['priority_done'][date] = list(items)
    return clean

def lookup_dictionary(word):
    if not isinstance(word, str) or not re.fullmatch(r"[a-zA-Z]+(?:['-][a-zA-Z]+)*", word) or len(word) > 80:
        return 400, {'error': 'Enter one English word (letters, apostrophes or hyphens).'}
    try:
        request = Request('https://api.dictionaryapi.dev/api/v2/entries/en/' + quote(word.lower()), headers={'User-Agent':'MilanDailyMissions/1.0'})
        with urlopen(request, timeout=5) as response:
            data = json.load(response)
        definitions = []
        for meaning in data[0].get('meanings', []):
            for definition in meaning.get('definitions', [])[:1]:
                definitions.append(meaning.get('partOfSpeech', 'word') + ': ' + definition['definition'])
        if not definitions: raise ValueError('No definition')
        return 200, dict(word=word, meaning='\n'.join(definitions[:2])[:2000], source='Free Dictionary API')
    except HTTPError as error:
        if error.code == 404: return 404, {'error':'No meaning found. Try another word, or write its meaning below.'}
        return 503, {'error':'Dictionary unavailable. You can write a meaning yourself and still save the word.'}
    except Exception:
        return 503, {'error':'Dictionary unavailable. You can write a meaning yourself and still save the word.'}

class Store:
    def __init__(self, path, factory=initial, validator=validate):
        self.path, self.lock = Path(path), threading.Lock()
        if self.path.exists():
            self.data = validator(json.loads(self.path.read_text()))
        else:
            self.save(factory())
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
        if urlsplit(self.path).path == '/api/dictionary':
            code, data = lookup_dictionary(parse_qs(urlsplit(self.path).query).get('word', [''])[0])
            self.reply(code, data)
            return
        if self.path in ('/api/activities', '/api/balaji'):
            store = self.server.balaji_store if self.path == '/api/balaji' else self.server.store
            with store.lock:
                self.reply(200, store.data)
        elif self.path in ('/', '/kids-activity.html', '/app.js', '/styles.css', '/wordbank.js', '/balaji', '/balaji/', '/balaji.html', '/balaji.js','/balaji-vocabulary.js', '/balaji.css', '/assets/black-panther.png', '/assets/batman.png', '/assets/deadpool.png', '/assets/spider-man.png', '/assets/milan-hero.png', '/assets/milan-swing.png', '/assets/milan-leap.png'):
            if self.path == '/': self.path = '/kids-activity.html'
            if self.path in ('/balaji', '/balaji/'):
                self.path = '/balaji.html'
            super().do_GET()
        else:
            self.send_error(404)
    def do_POST(self):
        if self.path not in ('/api/activities', '/api/balaji'):
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
            is_balaji = self.path == '/api/balaji'
            validator = validate_balaji if is_balaji else validate
            store = self.server.balaji_store if is_balaji else self.server.store
            data = validator(json.loads(self.rfile.read(size)))
            with store.lock: store.save(data)
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
    server.balaji_store = Store(ROOT / 'data' / 'balaji.json', initial_balaji, validate_balaji)
    print(f'Activity tracker: http://{args.host}:{server.server_port}', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
if __name__ == '__main__': main()
