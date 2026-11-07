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

class ApplicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'data' / 'activities.json'
        self.start()
    def start(self):
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.http.store = server.Store(self.path)
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
        data['children'][0]['days'][today] = dict(reading=35, academics=20, exercise=5)
        data['children'][1]['name'] = 'Robin'
        data['children'][1]['days'][today] = dict(reading=0, academics=30, exercise=60)
        data['children'][0]['days'][past] = dict(reading=10, academics=0, exercise=20)
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
    def test_invalid_restores_preserve_disk(self):
        before = self.path.read_bytes()
        variants = [None, {}, {'version':1,'children':[]}]
        for value in [-1, 1.5, True, 1441]:
            data = server.initial()
            data['children'][0]['days']['2020-01-01'] = dict(reading=value, academics=0, exercise=0)
            variants.append(data)
        data = server.initial()
        data['children'][0]['days']['9999-01-01'] = dict(reading=0, academics=0, exercise=0)
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
        self.assertIn(b'Little steps', self.get('/'))
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
