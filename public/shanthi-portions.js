/* Practical serving estimates, separate from official CoFID per-100 nutrient data.
   They are editable approximations, not official CoFID household measures. */
globalThis.ShanthiPortions = Object.freeze({
  suggest(food) {
    const name=String(food?.name||'').toLowerCase();
    if(!name||food?.basis==='ml')return null;
    const portion=(label,count,size)=>({label,count,size});
    if(/^eggs, chicken, whole,/.test(name)&&!/dried|powder/.test(name))return portion('1 egg','eggs',/fried|boiled/.test(name)?60:50);
    if(/^chapatis,/.test(name))return portion('1 chapati','chapatis',60);
    if(/^naan bread|^bread, naan/.test(name))return portion('1 naan','naans',90);
    if(/^pitta bread|^bread, pitta/.test(name))return portion('1 pitta','pittas',60);
    if(/^bread,/.test(name)&&!/pudding|crumb|fried|stuff/.test(name))return portion('1 slice','slices',40);
    if(/^toast,/.test(name))return portion('1 slice of toast','slices',35);
    if(/^bread rolls|^rolls, bread/.test(name))return portion('1 roll','rolls',60);
    if(/^crumpets/.test(name))return portion('1 crumpet','crumpets',50);
    if(/^bagels/.test(name))return portion('1 bagel','bagels',90);
    if(/^rice,/.test(name)&&/boiled|cooked|steamed|fried/.test(name)&&!/flour|dry|uncooked/.test(name))return portion('1 bowl of rice','bowls',180);
    if(/^(pasta|spaghetti|macaroni|noodles),/.test(name)&&/boiled|cooked/.test(name)&&!/dry|uncooked/.test(name))return portion('1 bowl','bowls',180);
    if(/^curry,/.test(name))return portion('1 bowl of curry','bowls',200);
    if(/^soup,/.test(name))return portion('1 bowl of soup','bowls',250);
    if(/^porridge,/.test(name))return portion('1 bowl of porridge','bowls',250);
    if(/^yoghurt,/.test(name))return portion('1 small pot','pots',125);
    if(/^milk,/.test(name)&&!/powder|dried|condensed|evaporated/.test(name))return portion('1 glass','glasses',200);
    if(/^(tea|coffee),/.test(name)&&!/instant, powder|dried|dry/.test(name))return portion('1 cup','cups',200);
    if(/^apples,/.test(name)&&/raw/.test(name))return portion('1 apple (edible part)','apples',150);
    if(/^bananas,/.test(name)&&/raw/.test(name))return portion('1 banana (peeled)','bananas',120);
    if(/^oranges,/.test(name)&&/raw/.test(name))return portion('1 orange (peeled)','oranges',130);
    if(/^pears,/.test(name)&&/raw/.test(name))return portion('1 pear (edible part)','pears',150);
    if(/^peanut butter/.test(name))return portion('1 tablespoon','tablespoons',15);
    if(/^butter,/.test(name))return portion('1 teaspoon','teaspoons',5);
    if(/^oil,/.test(name))return portion('1 teaspoon','teaspoons',5);
    if(/^cheese,/.test(name)&&!/sauce|spread|cottage/.test(name))return portion('1 small serving','servings',30);
    // Foods not recognised above require an explicit size; never assume one item is 100 g.
    return null;
  }
});
