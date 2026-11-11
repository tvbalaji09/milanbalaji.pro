"""UK CoFID 2021 search. No network service or API key is needed at runtime."""
import json
from pathlib import Path
import re
import unicodedata
DATASET = json.loads((Path(__file__).resolve().parent / 'nutrition' / 'cofid.json').read_text())
ALIASES = dict(roti='chapati', rotis='chapati', chapatis='chapati', yogurt='yoghurt', yogurts='yoghurt', yoghurts='yoghurt', aubergines='aubergine', eggplant='aubergine', zucchini='courgette', cilantro='coriander')
def terms(text):
    tokens = re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD', text.lower())).split()
    return [ALIASES.get(token, token) for token in tokens]
CATALOGUE = [(food, terms(food['name'])) for food in DATASET['foods']]
def search_nutrition(query):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 120 or len(query) > 120 or any(ord(c) < 32 for c in query):
        return 400, {'error': 'Enter a food name of 2–120 characters.'}
    query = query.strip()
    wanted = terms(query)
    if not wanted:
        return 200, dict(foods=[], source='UK CoFID 2021')
    matches = []
    for food, tokens in CATALOGUE:
        def matches_term(term):
            if term == 'cooked':
                return any(t in ('cooked', 'boiled', 'steamed', 'baked', 'fried', 'grilled', 'roasted') for t in tokens)
            return any(t.startswith(term) for t in tokens)
        if all(matches_term(term) for term in wanted):
            score = sum(5 for term in wanted if term in tokens) + (20 if food['name'].lower() == query.lower() else 0) + (3 if tokens[0] == wanted[0] else 0)
            matches.append((-score, len(food['name']), food['id'], food))
    matches.sort(key=lambda item: item[:3])
    return 200, dict(foods=[dict(id=f['id'], name=f['name'], kcalPer100=f['kcalPer100'], basis=f['basis'], source='UK CoFID 2021') for _, _, _, f in matches[:30]], source='UK CoFID 2021')
