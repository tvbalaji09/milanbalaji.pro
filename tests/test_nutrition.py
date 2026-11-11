import unittest
from unittest.mock import patch
import nutrition
class NutritionTests(unittest.TestCase):
    def test_official_values_and_duplicate_codes(self):
        foods=nutrition.DATASET['foods']
        self.assertEqual(len(foods),2849)
        self.assertEqual(len({f['id'] for f in foods}),2849)
        chapati=next(f for f in foods if f['name']=='Chapatis, made without fat')
        self.assertEqual(chapati['kcalPer100'],202)
        self.assertEqual(sum(f['code']=='13-669' for f in foods),2)
    def test_search_aliases_and_volume_basis(self):
        self.assertEqual(nutrition.search_nutrition('roti'),nutrition.search_nutrition('chapati'))
        code,data=nutrition.search_nutrition('wine red')
        self.assertEqual(code,200)
        self.assertEqual(data['foods'][0]['basis'],'ml')
        self.assertEqual(data['foods'][0]['kcalPer100'],76)
    def test_invalid_and_unknown_queries_and_no_external_requests(self):
        self.assertEqual(nutrition.search_nutrition('a')[0],400)
        self.assertEqual(nutrition.search_nutrition('x'*121)[0],400)
        self.assertEqual(nutrition.search_nutrition('!!!')[1]['foods'],[])
        self.assertEqual(nutrition.search_nutrition('idli')[1]['foods'],[])
        with patch('urllib.request.urlopen',side_effect=AssertionError('No external lookup needed')):
            self.assertTrue(nutrition.search_nutrition('chicken curry')[1]['foods'])
