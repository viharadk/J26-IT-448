import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';
import { createLatestRequest, normalizeQuery, parseCoordinates } from '../src/search/locationSearch';

function load(file: string, mocks: Record<string, unknown>) {
  const filename = path.resolve(__dirname, '..', file), realRequire = createRequire(filename);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as any };
  vm.runInThisContext(`(function(exports,require,module){${output}\n})`, { filename })(mod.exports,
    (name: string) => Object.hasOwn(mocks, name) ? mocks[name] : realRequire(name), mod);
  return mod.exports;
}

function nodes(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...nodes(node.props.children)];
}
function content(node: any): string {
  if (Array.isArray(node)) return node.map(content).join(' ');
  return typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? content(node.props.children) : '';
}

function hookHarness() {
  const values: any[] = [], refs: any[] = [];
  let stateIndex = 0, refIndex = 0;
  const hooks = {
    useState(initial: any) {
      const index = stateIndex++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], (next: any) => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useRef(initial: any) {
      const index = refIndex++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useEffect() {},
    beginRender() { stateIndex = 0; refIndex = 0; },
  };
  return hooks;
}

const native = {
  ...Object.fromEntries(['View', 'Text', 'TextInput', 'ScrollView', 'Pressable', 'ActivityIndicator', 'KeyboardAvoidingView'].map(name => [name, name])),
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
  Keyboard: { dismiss() {} }, Platform: { OS: 'android' }, Linking: { openURL: async () => {} },
};

test('compact search expands accessibly, preserves place results, and collapses after selection without losing coordinates', async () => {
  const hooks = hookHarness();
  const place = { id: 'kelaniya', name: 'Kelaniya, Sri Lanka', latitude: 6.9553, longitude: 79.9217 };
  const selected: any[] = [];
  const { LocationSearch } = load('src/components/LocationSearch.tsx', {
    react: hooks, 'react-native': native, '../theme': { colors: {} },
    '../api/geocoding': { searchPlaces: async (query: string) => { assert.equal(query, 'Kelaniya'); return [place]; } },
    '../search/locationSearch': { createLatestRequest, normalizeQuery, parseCoordinates },
  });
  const props = { onSelect: (value: any) => selected.push(value), onReset() {}, selectionVersion: 0 };
  const render = () => { hooks.beginRender(); return LocationSearch(props); };

  let tree = render();
  let toggle = nodes(tree).find(node => node.props.accessibilityLabel === 'Expand location search');
  assert.ok(toggle); assert.deepEqual(toggle.props.accessibilityState, { expanded: false });
  assert.equal(nodes(tree).some(node => node.type === 'ScrollView'), false, 'collapsed search occupies only its compact trigger');

  toggle.props.onPress(); tree = render();
  toggle = nodes(tree).find(node => node.props.accessibilityLabel === 'Collapse location search');
  assert.ok(toggle); assert.deepEqual(toggle.props.accessibilityState, { expanded: true });
  const searchScroll = nodes(tree).find(node => node.type === 'ScrollView');
  assert.equal(searchScroll.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(searchScroll.props.keyboardDismissMode, 'on-drag');
  const placeInput = nodes(tree).find(node => node.props.accessibilityLabel === 'Location name in Sri Lanka');
  placeInput.props.onChangeText('  Kelaniya  '); tree = render();
  nodes(tree).find(node => node.props.accessibilityLabel === 'Search places').props.onPress();
  await new Promise(resolve => setImmediate(resolve)); tree = render();
  assert.ok(nodes(tree).some(node => node.props.accessibilityLabel === 'Select Kelaniya, Sri Lanka'));

  const router = StackRouter({ initialRouteName: 'Home' });
  const options = { routeNames: ['Home', 'Function1', 'LocationAnalysis'], routeParamList: {}, routeGetIdList: {} };
  let stack = router.getInitialState(options);
  stack = router.getRehydratedState(router.getStateForAction(stack, StackActions.push('Function1'), options)!, options);
  const mapRoute = stack.routes[stack.index];
  stack = router.getRehydratedState(router.getStateForAction(stack, StackActions.push('LocationAnalysis'), options)!, options);
  stack = router.getRehydratedState(router.getStateForAction(stack, CommonActions.goBack(), options)!, options);
  assert.equal(stack.routes[stack.index], mapRoute, 'Back reveals the same mounted map route');
  tree = render();
  assert.ok(nodes(tree).some(node => node.props.accessibilityLabel === 'Select Kelaniya, Sri Lanka'), 'search results survive the detail-screen round trip');

  // A manual collapse/reopen cycle also keeps selectable results in the mounted search instance.
  nodes(tree).find(node => node.props.accessibilityLabel === 'Collapse location search').props.onPress(); tree = render();
  nodes(tree).find(node => node.props.accessibilityLabel === 'Expand location search').props.onPress(); tree = render();
  const result = nodes(tree).find(node => node.props.accessibilityLabel === 'Select Kelaniya, Sri Lanka');
  assert.ok(result); result.props.onPress(); tree = render();
  assert.deepEqual(selected, [place]);
  assert.ok(nodes(tree).some(node => node.props.accessibilityLabel === 'Expand location search'), 'selection collapses the search');

  // Reopening exposes the selected coordinates and text instead of resetting them.
  nodes(tree).find(node => node.props.accessibilityLabel === 'Expand location search').props.onPress(); tree = render();
  nodes(tree).find(node => node.type === 'Pressable' && content(node) === 'Latitude / longitude').props.onPress(); tree = render();
  assert.equal(nodes(tree).find(node => node.props.accessibilityLabel === 'Latitude in decimal degrees').props.value, '6.9553');
  assert.equal(nodes(tree).find(node => node.props.accessibilityLabel === 'Longitude in decimal degrees').props.value, '79.9217');
});

test('coordinate search remains reachable in the bounded keyboard-aware panel and preserves entered values', () => {
  const hooks = hookHarness(), selected: any[] = [];
  const { LocationSearch } = load('src/components/LocationSearch.tsx', {
    react: hooks, 'react-native': native, '../theme': { colors: {} }, '../api/geocoding': { searchPlaces: async () => [] },
    '../search/locationSearch': { createLatestRequest, normalizeQuery, parseCoordinates },
  });
  const render = () => { hooks.beginRender(); return LocationSearch({ onSelect: (value: any) => selected.push(value), onReset() {}, selectionVersion: 0 }); };
  let tree = render();
  nodes(tree).find(node => node.props.accessibilityLabel === 'Expand location search').props.onPress(); tree = render();
  nodes(tree).find(node => node.type === 'Pressable' && content(node) === 'Latitude / longitude').props.onPress(); tree = render();
  nodes(tree).find(node => node.props.accessibilityLabel === 'Latitude in decimal degrees').props.onChangeText('6.95');
  nodes(tree).find(node => node.props.accessibilityLabel === 'Longitude in decimal degrees').props.onChangeText('79.92'); tree = render();
  nodes(tree).find(node => node.type === 'Pressable' && content(node) === 'Go to coordinates').props.onPress(); tree = render();
  assert.deepEqual(selected, [{ latitude: 6.95, longitude: 79.92 }]);
  assert.ok(nodes(tree).some(node => node.props.accessibilityLabel === 'Expand location search'));
  nodes(tree).find(node => node.props.accessibilityLabel === 'Expand location search').props.onPress(); tree = render();
  assert.equal(nodes(tree).find(node => node.props.accessibilityLabel === 'Latitude in decimal degrees').props.value, '6.95');
  assert.equal(nodes(tree).find(node => node.props.accessibilityLabel === 'Longitude in decimal degrees').props.value, '79.92');
});

test('map layer and selected marker survive detail navigation while the map remains uncontrolled', () => {
  const hooks = hookHarness(), pushes: string[] = [];
  const point = { latitude: 6.9553, longitude: 79.9217, name: 'Kelaniya' };
  const { HazardMapScreen } = load('src/screens/HazardMapScreen.tsx', {
    react: hooks, 'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '../theme': { colors: {} },
    '../api/flood': { checkRasterTiles: async () => {}, getHazardTiles: async () => ({}), INITIAL_REGION: { latitude: 7, longitude: 80 }, inspectionLabel: () => 'High', LEGEND: [['High', '#f00']] },
    '../function1/Function1Provider': { useFunction1: () => ({ state: { point, inspection: { hazardClass: 'High' }, loading: false, version: 1 }, store: { select() {}, reset() {} } }) },
    '../components/LocationSearch': { LocationSearch: 'LocationSearch' }, '../search/locationSearch': {},
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', UrlTile: 'UrlTile' },
  });
  const render = () => { hooks.beginRender(); return HazardMapScreen({ navigation: { push: (route: string) => pushes.push(route) } } as any); };
  let tree = render();
  nodes(tree).find(node => node.props.accessibilityLabel === 'Satellite map').props.onPress(); tree = render();
  let map = nodes(tree).find(node => node.type === 'MapView');
  assert.equal(map.props.mapType, 'satellite'); assert.equal(map.props.region, undefined); assert.ok(map.props.initialRegion);
  assert.deepEqual(nodes(tree).find(node => node.type === 'Marker').props.coordinate, point);
  nodes(tree).find(node => node.props.accessibilityLabel === 'Open hazard summary').props.onPress();
  assert.deepEqual(pushes, ['HazardSummary']);

  // Native-stack Back reveals this same screen instance; rerendering it retains hook state and marker selection.
  tree = render(); map = nodes(tree).find(node => node.type === 'MapView');
  assert.equal(map.props.mapType, 'satellite');
  assert.deepEqual(nodes(tree).find(node => node.type === 'Marker').props.coordinate, point);
  nodes(tree).find(node => node.props.accessibilityLabel === 'Standard map').props.onPress(); tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'MapView').props.mapType, 'standard');
});
