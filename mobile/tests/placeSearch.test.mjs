import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaces, searchPlaces } from '../src/services/placeSearch.ts';

test('search results show distinct names and addresses and reject invalid coordinates', () => {
  assert.deepEqual(parsePlaces({ features: [
    { geometry: { coordinates: [28.64, 44.17] }, properties: { name: 'Tomis Mall', street: 'Strada Ștefan cel Mare', housenumber: '36', city: 'Constanța', county: 'Constanța', country: 'România', countrycode: 'RO' } },
    { geometry: { coordinates: [28.5, 44.1] }, properties: { name: 'outside', countrycode: 'BG' } },
    { geometry: { coordinates: [200, 44] }, properties: { name: 'invalid', countrycode: 'RO' } },
    { geometry: { coordinates: [26.1, 47.6] }, properties: { street: 'Strada Unirii', housenumber: '2', city: 'Suceava', countrycode: 'RO' } },
  ] }), [
    { coordinate: { latitude: 44.17, longitude: 28.64 }, label: 'Tomis Mall', detail: 'Strada Ștefan cel Mare 36, Constanța, România' },
    { coordinate: { latitude: 47.6, longitude: 26.1 }, label: 'Strada Unirii 2', detail: 'Suceava' },
  ]);
});

test('search sends query and optional location and surfaces server errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const params = new URL(url).searchParams;
      assert.equal(params.get('q'), 'Tomis Mall');
      assert.equal(params.get('countrycode'), 'RO');
      assert.equal(params.get('location_bias_scale'), '0.1');
      assert.equal(params.get('lat'), '44.17');
      assert.equal(params.get('lon'), '28.64');
      return { ok: true, json: async () => ({ features: [
        { geometry: { coordinates: [26.1, 44.4] }, properties: { name: 'Departe', countrycode: 'RO' } },
        { geometry: { coordinates: [28.65, 44.18] }, properties: { name: 'Aproape', countrycode: 'RO' } },
      ] }) };
    };
    const places = await searchPlaces('Tomis Mall', { latitude: 44.17, longitude: 28.64 }, new AbortController().signal);
    assert.deepEqual(places.map((place) => place.label), ['Aproape', 'Departe']);
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(searchPlaces('abc', null, new AbortController().signal));
  } finally { globalThis.fetch = original; }
});
