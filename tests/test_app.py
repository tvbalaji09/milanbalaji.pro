import copy
import datetime
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
import server

def full_day(**values):
    return dict.fromkeys(server.CATEGORIES, 0) | values

class ApplicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'data' / 'activities.json'
        self.start()
    def start(self):
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.http.store = server.Store(self.path)
        self.http.balaji_store = server.Store(self.path.parent / 'balaji.json', server.initial_balaji, server.validate_balaji)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.http.server_port}'
    def stop(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
    def tearDown(self):
        self.stop()
        self.temp.cleanup()
    def get(self, path='/api/activities'):
        with urlopen(self.url + path) as response: return response.read()
    def save(self, data, origin=None):
        headers = {'Content-Type': 'application/json'}
        if origin: headers['Origin'] = origin
        with urlopen(Request(self.url+'/api/activities', data=json.dumps(data).encode(), headers=headers)) as response:
            return json.load(response)
    def test_save_restart_restore_and_child_isolation(self):
        data = json.loads(self.get())
        today = datetime.date.today().isoformat()
        past = (datetime.date.today()-datetime.timedelta(days=45)).isoformat()
        data['children'][0]['name'] = 'Alex'
        data['children'][0]['days'][today] = full_day(reading=35, academics=20, exercise=5)
        data['children'][1]['name'] = 'Robin'
        data['children'][1]['days'][today] = full_day(reading=0, academics=30, exercise=60)
        data['children'][0]['days'][past] = full_day(reading=10, academics=0, exercise=20)
        self.assertEqual(self.save(data), data)
        self.assertEqual(json.loads(self.path.read_text()), data)
        self.stop(); self.start()
        self.assertEqual(json.loads(self.get()), data)
        backup = json.loads(self.get())
        changed = copy.deepcopy(data)
        changed['children'][0]['days'][today]['reading'] = 1
        self.save(changed)
        self.assertEqual(json.loads(self.get())['children'][1], data['children'][1])
        self.assertEqual(self.save(backup), data)
        self.stop(); self.start()
        self.assertEqual(json.loads(self.get()), backup)
    def test_balaji_api_and_restart_isolation(self):
        original = self.path.read_bytes()
        with urlopen(self.url + '/api/balaji') as response: data = json.load(response)
        data['days']['2020-01-01'] = dict(connect=True, move=False, health=True, learn=False)
        data['entries']['2020-01-01'] = dict(mood_energy='Calm', win='Progress', work_learning='Python', health_fitness='Walk', gratitude='Family', tomorrow_priority='Connect')
        def save_balaji(value):
            request = Request(self.url + '/api/balaji', data=json.dumps(value).encode(), headers={'Content-Type':'application/json'})
            with urlopen(request) as response: return json.load(response)
        self.assertEqual(save_balaji(data), data)
        self.stop(); self.start()
        with urlopen(self.url + '/api/balaji') as response: self.assertEqual(json.load(response), data)
        self.assertEqual(self.path.read_bytes(), original)
        invalid = copy.deepcopy(data)
        invalid['days']['2020-01-01']['move'] = 1
        with self.assertRaises(HTTPError) as error: save_balaji(invalid)
        self.assertEqual(error.exception.code, 400)
        self.assertIn(b'Balaji', self.get('/balaji'))
        self.assertTrue(self.get('/assets/black-panther.png').startswith(bytes([137,80,78,71])))

    def test_invalid_restores_preserve_disk(self):
        before = self.path.read_bytes()
        variants = [None, {}, {'version':1,'children':[]}]
        for value in [-1, 1.5, True, 1441]:
            data = server.initial()
            data['children'][0]['days']['2020-01-01'] = full_day(reading=value, academics=0, exercise=0)
            variants.append(data)
        data = server.initial()
        data['children'][0]['days']['9999-01-01'] = full_day(reading=0, academics=0, exercise=0)
        variants.append(data)
        for data in variants:
            with self.assertRaises(HTTPError) as error: self.save(data)
            self.assertEqual(error.exception.code, 400)
            self.assertEqual(self.path.read_bytes(), before)
    def test_private_paths_and_cross_origin(self):
        for path in ['/data/activities.json', '/server.py', '/../data/activities.json', '/%2e%2e/data/activities.json']:
            with self.assertRaises(HTTPError) as error: self.get(path)
            self.assertEqual(error.exception.code, 404)
        with self.assertRaises(HTTPError) as error: self.save(server.initial(), 'https://example.com')
        self.assertEqual(error.exception.code, 403)
        self.assertIn(b'Daily Missions', self.get('/'))
    def test_atomic_failure_keeps_previous_records(self):
        before = self.path.read_bytes()
        data = server.initial(); data['children'][0]['name'] = 'Updated'
        with patch('server.os.replace', side_effect=OSError('disk failure')):
            with self.assertRaises(HTTPError) as error: self.save(data)
        self.assertEqual(error.exception.code, 500)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(json.loads(self.get()), server.initial())
        self.assertEqual(list(self.path.parent.glob('.activities-*')), [])

if __name__ == '__main__': unittest.main()

class LegacyBackupTests(unittest.TestCase):
    def test_legacy_upgrade_and_new_skills_survive_restart(self):
        legacy = server.initial()
        legacy['version'] = 1
        legacy['children'][0]['days']['2020-01-01'] = dict(reading=30, academics=15, exercise=5)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'activities.json'
            path.write_text(json.dumps(legacy))
            store = server.Store(path)
            self.assertEqual(store.data['version'], 3)
            day = store.data['children'][0]['days']['2020-01-01']
            self.assertEqual(day, full_day(reading=30, academics=15, exercise=5))
            day.update(family_fun=10, guitar=20, journal=5)
            store.save(server.validate(store.data))
            restarted = server.Store(path)
            self.assertEqual(restarted.data, store.data)
            self.assertEqual(restarted.data['children'][1]['days'], {})
            invalid = copy.deepcopy(store.data)
            invalid['children'][0]['days']['2020-01-01']['journal'] = -1
            with self.assertRaises(ValueError): server.validate(invalid)

class JournalTests(unittest.TestCase):
    def test_journal_round_trip_and_legacy_records(self):
        entry = dict(mood='Happy 😊', tomorrow_goal='Practise guitar', thankful='Family', challenge='Maths', proud='I tried')
        data = server.initial()
        data['children'][0]['entries']['2020-01-01'] = entry
        data['children'][1]['entries']['2020-01-01'] = dict(entry, mood='Calm')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'activities.json'
            store = server.Store(path)
            store.save(server.validate(data))
            self.assertEqual(server.Store(path).data, data)
            restored = server.validate(json.loads(json.dumps(data)))
            self.assertEqual(restored, data)
        for invalid in [dict(entry, mood=3), dict(entry, proud='x'*2001), dict(entry, extra='bad')]:
            bad = copy.deepcopy(data)
            bad['children'][0]['entries']['2020-01-01'] = invalid
            with self.assertRaises(ValueError): server.validate(bad)
        old = server.initial()
        old['version'] = 2
        for child in old['children']: child.pop('entries')
        self.assertEqual(server.validate(old)['children'][0]['entries'], {})
