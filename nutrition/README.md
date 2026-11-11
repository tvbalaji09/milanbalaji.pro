# UK CoFID 2021 energy data

Source: Public Health England, McCance and Widdowson’s Composition of Foods Integrated Dataset 2021, table **1.3 Proximates**.

- Publication: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid
- Workbook URL and SHA-256 are recorded in `cofid.json`.
- Contains public sector information licensed under the **Open Government Licence v3.0**: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
- Derived by `scripts/import_cofid.py`, using Python’s standard library. No source values are replaced by hand-authored estimates.

Fields retained: food code, name, food group, numeric energy in kcal, reference unit. Nutrients use a 100 g basis, except alcoholic beverages (group Q) which use 100 ml, per the workbook’s notes. Missing, `N` or `Tr` energy values are excluded rather than converted to zero. Actual numeric zeros remain valid.

There are 2,849 imported records and 38 exclusions. Food code `13-669` occurs twice in the source for aubergine and watercress. Both records are retained; their internal IDs include the worksheet row number. Four-digit food codes are retained as well as three-digit codes.

This dataset describes typical foods, not every product or recipe. Raw/cooked preparation, portion weight and recipe differences matter. The page displays the source and permits a manual override; no personal calorie target is derived from the dataset.
