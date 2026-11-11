/* Optional online lookup. Only the word is shared with the dictionary provider. */
globalThis.MilanDictionary = Object.freeze({
  async lookup(word, fetcher = fetch) {
    if (typeof word !== 'string' || !/^[a-zA-Z]+(?:['-][a-zA-Z]+)*$/.test(word) || word.length > 80) {
      throw new Error('Enter one English word (letters, apostrophes or hyphens).');
    }
    const missing = 'No meaning found. Check the spelling, or write its meaning below.';
    try {
      const response = await fetcher('/api/dictionary?word=' + encodeURIComponent(word), {
        signal: AbortSignal.timeout(5500)
      });
      if (response.status === 404) throw Object.assign(new Error(missing), {notFound: true});
      if (response.status === 401) throw Object.assign(new Error('Reload the page and sign in before looking up a word.'), {signIn: true});
      if (response.ok) {
        const data = await response.json();
        if (typeof data.meaning === 'string' && data.meaning.trim()) return data;
      }
    } catch (error) {
      if (error.notFound || error.signIn) throw error;
      // A server-side network failure can still allow a CORS request from the browser.
    }
    try {
      const response = await fetcher('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word.toLowerCase()), {
        credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(7000)
      });
      if (response.status === 404) throw Object.assign(new Error(missing), {notFound: true});
      if (!response.ok) throw new Error('Provider unavailable');
      const data = await response.json();
      const definitions = data?.[0]?.meanings?.flatMap(item =>
        (item.definitions || []).slice(0, 1).filter(entry => typeof entry.definition === 'string')
          .map(entry => `${item.partOfSpeech || 'word'}: ${entry.definition}`)
      ).slice(0, 2);
      if (!definitions?.length) throw new Error('No definition');
      return {word, meaning: definitions.join('\n').slice(0, 2000), source: 'Free Dictionary API'};
    } catch (error) {
      if (error.notFound) throw error;
      throw new Error('The dictionary could not be reached. Try again shortly, choose an offline word, or enter a meaning yourself.');
    }
  }
});
