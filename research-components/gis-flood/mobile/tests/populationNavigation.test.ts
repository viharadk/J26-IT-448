import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as React from 'react';
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';
import { parsePopulationExposure } from '../src/api/population';

// Execute the actual JSX with native hosts stubbed. These binding/content tests
// are not native rendering tests; real emulator evidence is documented separately.
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
const native = { ...Object.fromEntries(['View', 'Text', 'ScrollView', 'Pressable', 'ActivityIndicator', 'KeyboardAvoidingView'].map(name => [name, name])),
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} }, Keyboard: { dismiss() {} }, Platform: { OS: 'android' } };
const safe = { SafeAreaView: 'SafeAreaView', SafeAreaProvider: 'SafeAreaProvider' };
function app() {
  const Hazard = () => null, Population = () => null;
  const { App: _unused, default: App } = load('App.tsx', {
    '@react-navigation/native': { NavigationContainer: 'NavigationContainer' },
    '@react-navigation/native-stack': { createNativeStackNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }) },
    'react-native-safe-area-context': safe, 'expo-status-bar': { StatusBar: 'StatusBar' }, './src/theme': { navigationTheme: {}, colors: {} },
    './src/screens/HomeScreen': { HomeScreen: () => null }, './src/screens/HazardMapScreen': { HazardMapScreen: Hazard },
    './src/function1/Function1Provider': { Function1Provider: 'Function1Provider' },
    './src/screens/LocationAnalysisScreen': { LocationAnalysisScreen: () => null },
    './src/screens/HazardSummaryScreen': { HazardSummaryScreen: () => null },
    './src/screens/PopulationExposureScreen': { PopulationExposureScreen: Population },
    './src/screens/SarAnalysisScreen': { SarAnalysisScreen: () => null }, './src/sar/SarWorkflowProvider': { SarWorkflowProvider: 'Provider' },
  });
  return { registrations: nodes(App()).filter(n => n.type === 'Screen'), Hazard, Population };
}

test('actual root stack resolves PopulationExposure to its dedicated native screen and title', () => {
  const { registrations, Hazard, Population } = app();
  assert.deepEqual(registrations.map(n => n.props.name), ['Home', 'Function1', 'LocationAnalysis', 'PopulationExposure', 'HazardSummary', 'Function2']);
  assert.equal(registrations.find(n => n.props.name === 'PopulationExposure').props.component, Population);
  assert.equal(registrations.find(n => n.props.name === 'PopulationExposure').props.options.title, 'Population Exposure');
  assert.equal(registrations.find(n => n.props.name === 'PopulationExposure').props.options.presentation, 'card');
  assert.equal(registrations.find(n => n.props.name === 'Function1').props.component, Hazard);
});

test('actual map button pushes population and native Back retains the same Function1 route identity', () => {
  const routeNames = app().registrations.map(n => n.props.name), router = StackRouter({ initialRouteName: 'Home' });
  const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
  let stack = router.getInitialState(options);
  stack = router.getRehydratedState(router.getStateForAction(stack, StackActions.push('Function1'), options)!, options);
  const mapRoute = stack.routes[stack.index], originalKey = mapRoute.key;
  const hooks = { ...React, useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: (current: unknown) => ({ current }), useEffect: () => {} };
  const { HazardMapScreen } = load('src/screens/HazardMapScreen.tsx', {
    react: hooks, 'react-native': native, 'react-native-safe-area-context': safe,
    '../theme': { colors: {} },
    '../function1/Function1Provider': { useFunction1: () => ({ state: { point: null, inspection: null, loading: false, version: 0 }, store: {} }) },
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', UrlTile: 'UrlTile' },
    '../components/LocationSearch': { LocationSearch: 'LocationSearch' },
    '../components/LocationAnalysisPanel': { LocationAnalysisPanel: 'LocationAnalysisPanel' },
  });
  const calls: string[] = [];
  const tree = HazardMapScreen({ navigation: { push: (route: string) => { calls.push(route); stack = router.getRehydratedState(router.getStateForAction(stack, StackActions.push(route), options)!, options); } } });
  const button = nodes(tree).find(n => n.type === 'Pressable' && content(n) === 'Population exposure');
  assert.ok(button); assert.equal(button.props.accessibilityRole, 'button'); button.props.onPress();
  assert.deepEqual(calls, ['PopulationExposure']); assert.equal(stack.routes[stack.index].name, 'PopulationExposure');
  assert.equal(stack.routes.find(r => r.key === originalKey), mapRoute, 'Push retains the existing map route rather than replacing it');
  stack = router.getRehydratedState(router.getStateForAction(stack, CommonActions.goBack(), options)!, options);
  assert.equal(stack.routes[stack.index], mapRoute); assert.equal(stack.routes[stack.index].key, originalKey);
  assert.ok(nodes(tree).some(n => n.type === 'MapView')); assert.ok(nodes(tree).some(n => n.type === 'LocationSearch'));
  assert.ok(!nodes(tree).some(n => n.type === 'Modal'), 'Map is no longer a modal host');
});

test('actual map button pushes location analysis and native Back retains the same Function1 route identity', () => {
  const routeNames = app().registrations.map(n => n.props.name), router = StackRouter({ initialRouteName: 'Home' });
  const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
  let stack = router.getInitialState(options);
  stack = router.getRehydratedState(router.getStateForAction(stack, StackActions.push('Function1'), options)!, options);
  const mapRoute = stack.routes[stack.index], originalKey = mapRoute.key;
  const hooks = { ...React, useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: (current: unknown) => ({ current }), useEffect: () => {} };
  const { HazardMapScreen } = load('src/screens/HazardMapScreen.tsx', {
    react: hooks, 'react-native': native, 'react-native-safe-area-context': safe,
    '../theme': { colors: {} },
    '../function1/Function1Provider': { useFunction1: () => ({ state: { point: null, inspection: null, loading: false, version: 0 }, store: {} }) },
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', UrlTile: 'UrlTile' },
    '../components/LocationSearch': { LocationSearch: 'LocationSearch' },
    '../components/LocationAnalysisPanel': { LocationAnalysisPanel: 'LocationAnalysisPanel' },
  });
  const calls: string[] = [];
  const tree = HazardMapScreen({ navigation: { push: (route: string) => { calls.push(route); stack = router.getRehydratedState(router.getStateForAction(stack, StackActions.push(route), options)!, options); } } });
  const button = nodes(tree).find(n => n.type === 'Pressable' && content(n) === 'Location analysis');
  assert.ok(button); assert.equal(button.props.accessibilityRole, 'button'); button.props.onPress();
  assert.deepEqual(calls, ['LocationAnalysis']); assert.equal(stack.routes[stack.index].name, 'LocationAnalysis');
  assert.equal(stack.routes.find(r => r.key === originalKey), mapRoute, 'Push retains the existing map route rather than replacing it');
  stack = router.getRehydratedState(router.getStateForAction(stack, CommonActions.goBack(), options)!, options);
  assert.equal(stack.routes[stack.index], mapRoute); assert.equal(stack.routes[stack.index].key, originalKey);
  assert.ok(nodes(tree).some(n => n.type === 'MapView')); assert.ok(nodes(tree).some(n => n.type === 'LocationSearch'));
  assert.ok(!nodes(tree).some(n => n.type === 'Modal'), 'Map is no longer a modal host');
});

test('actual map button pushes hazard summary and native Back retains the same Function1 route identity', () => {
  const routeNames = app().registrations.map(n => n.props.name), router = StackRouter({ initialRouteName: 'Home' });
  const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
  let stack = router.getInitialState(options);
  stack = router.getRehydratedState(router.getStateForAction(stack, StackActions.push('Function1'), options)!, options);
  const mapRoute = stack.routes[stack.index], originalKey = mapRoute.key;
  const hooks = { ...React, useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: (current: unknown) => ({ current }), useEffect: () => {} };
  const { HazardMapScreen } = load('src/screens/HazardMapScreen.tsx', {
    react: hooks, 'react-native': native, 'react-native-safe-area-context': safe,
    '../theme': { colors: {} },
    '../function1/Function1Provider': { useFunction1: () => ({ state: { point: null, inspection: null, loading: false, version: 0 }, store: {} }) },
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', UrlTile: 'UrlTile' },
    '../components/LocationSearch': { LocationSearch: 'LocationSearch' },
    '../components/LocationAnalysisPanel': { LocationAnalysisPanel: 'LocationAnalysisPanel' },
  });
  const calls: string[] = [];
  const tree = HazardMapScreen({ navigation: { push: (route: string) => { calls.push(route); stack = router.getRehydratedState(router.getStateForAction(stack, StackActions.push(route), options)!, options); } } });
  const button = nodes(tree).find(n => n.type === 'Pressable' && content(n) === 'Hazard summary');
  assert.ok(button); assert.equal(button.props.accessibilityRole, 'button'); button.props.onPress();
  assert.deepEqual(calls, ['HazardSummary']); assert.equal(stack.routes[stack.index].name, 'HazardSummary');
  assert.equal(stack.routes.find(r => r.key === originalKey), mapRoute, 'Push retains the existing map route rather than replacing it');
  stack = router.getRehydratedState(router.getStateForAction(stack, CommonActions.goBack(), options)!, options);
  assert.equal(stack.routes[stack.index], mapRoute); assert.equal(stack.routes[stack.index].key, originalKey);
  assert.ok(nodes(tree).some(n => n.type === 'MapView')); assert.ok(nodes(tree).some(n => n.type === 'LocationSearch'));
  assert.ok(!nodes(tree).some(n => n.type === 'Modal'), 'Map is no longer a modal host');
});

test('dedicated screen owns exactly one reused controller and disposes it on route unmount', () => {
  let created = 0, loaded = 0, disposed = 0; const effects: (() => (() => void))[] = [];
  const state = { status: 'idle', data: null, error: '' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, load: async () => { loaded++; }, dispose: () => { disposed++; } };
  const { PopulationExposureScreen } = load('src/screens/PopulationExposureScreen.tsx', {
    react: { ...React, useState: (init: () => any) => [init()], useSyncExternalStore: (_subscribe: unknown, snapshot: () => any) => snapshot(), useEffect: (effect: any) => effects.push(effect) },
    '../components/PopulationExposureView': { PopulationExposureView: 'PopulationExposureView' },
    '../population/exposure': { createPopulationController: () => { created++; return store; } },
  });
  const tree = PopulationExposureScreen(); assert.equal(created, 1); assert.equal(effects.length, 1);
  const cleanup = effects[0](); assert.equal(loaded, 1); assert.equal(tree.props.state, state);
  tree.props.onRetry(); assert.equal(loaded, 2); cleanup(); assert.equal(disposed, 1);
});

function exposureView(state: any, onRetry = () => {}) {
  const { PopulationExposureView } = load('src/components/PopulationExposureView.tsx', {
    'react-native': native, 'react-native-safe-area-context': safe,
    '../theme': { colors: {} },
    './ui': { Action: 'Action', Card: 'Card', styles: {} },
  });
  return PopulationExposureView({ state, onRetry });
}
function fixture() {
  return parsePopulationExposure({ success: true, dataset: 'JRC/GHSL/P2023A/GHS_POP/2020', year: 2020, nativeResolutionMeters: 100,
    studyAreaPopulation: 1000, classifiedLandPopulation: 800, highAndVeryHighExposure: 400, highAndVeryHighPercentage: 40, unallocatedPopulation: 200,
    populationByHazardClass: ['Low', 'Moderate', 'High', 'Very High'].map((hazardClass, index) => ({ classId: index + 1, hazardClass,
      population: 100, percentageOfStudyAreaPopulation: 10, percentageOfClassifiedLandPopulation: 12.5 })),
    methodology: { allocation: 'Backend fraction allocation', boundary: 'Backend boundary caveat' }, limitations: ['Backend estimate uncertainty'] });
}

test('scrolling screen retains all real fields, explicit denominators and backend/scientific caveats', () => {
  const tree = exposureView({ status: 'success', data: fixture(), error: '' }), scroll = nodes(tree).find(n => n.type === 'ScrollView');
  assert.ok(scroll); assert.ok(!nodes(tree).some(n => n.type === 'Modal'));
  const text = content(scroll);
  for (const required of ['1,000', '800', '400', '200', '40%', 'Low', 'Moderate', 'High', 'Very High',
    'Of study-area population', 'Of classified-land population', 'GHSL/P2023A/GHS_POP/2020', '2020', '100',
    'Backend fraction allocation', 'Backend boundary caveat', 'Backend estimate uncertainty', 'not specific to your searched coordinate',
    'not currently flooded', 'fills masked source population cells with zero', 'independent flood validation remains pending']) assert.ok(text.includes(required), required);
});

test('view exposes loading, active error and functional retry without losing existing estimates', () => {
  const loading = exposureView({ status: 'loading', data: null, error: '' });
  assert.ok(nodes(loading).some(n => n.type === 'ActivityIndicator')); assert.equal(nodes(loading).find(n => n.type === 'Action').props.disabled, true);
  let retries = 0;
  const error = exposureView({ status: 'error', data: fixture(), error: 'HTTP 502' }, () => { retries++; });
  assert.ok(content(error).includes('HTTP 502')); assert.ok(content(error).includes('Previously loaded estimates are retained'));
  nodes(error).find(n => n.type === 'Action').props.onPress(); assert.equal(retries, 1); assert.ok(content(error).includes('1,000'));
});

test('view distinguishes empty, null and zero population instead of inventing a percentage', () => {
  const empty = exposureView({ status: 'success', data: parsePopulationExposure({ success: true }), error: '' });
  assert.ok(content(empty).includes('No population exposure estimates were returned')); assert.ok(content(empty).includes('Unavailable'));
  const zero = exposureView({ status: 'success', data: { ...fixture(), studyAreaPopulation: 0, classifiedLandPopulation: 0, highAndVeryHighPercentage: 0 }, error: '' });
  assert.ok(content(zero).includes('zero estimated study-area population')); assert.ok(content(zero).includes('Not estimable (zero denominator)'));
});

test('location route direct entry explains missing selection and returns to existing map', () => {
  const calls: string[] = [];
  const { LocationAnalysisScreen } = load('src/screens/LocationAnalysisScreen.tsx', {
    react: { ...React, useRef: (current: unknown) => ({ current }) }, 'react-native': native, 'react-native-safe-area-context': safe,
    '../components/ui': { Action: 'Action', Card: 'Card', styles: {} },
    '../components/LocationAnalysisPanel': { LocationAnalysisPanel: 'LocationAnalysisPanel' },
    '../function1/Function1Provider': { useFunction1: () => ({ state: { point: null }, store: {} }) },
  });
  const tree = LocationAnalysisScreen({ navigation: { popTo: (route: string) => calls.push(route) } });
  assert.ok(content(tree).includes('No location selected')); assert.ok(!nodes(tree).some(n => n.type === 'LocationAnalysisPanel'));
  nodes(tree).find(n => n.type === 'Action').props.onPress(); assert.deepEqual(calls, ['Function1']);
});
test('location route reuses factor panel with current loading/error/result and working retry and Back', () => {
  let retries = 0, backs = 0;
  const point = { latitude: 6.95, longitude: 79.92, name: 'Kelaniya' };
  const inspection = { hazardClass: 'High' };
  const { LocationAnalysisScreen } = load('src/screens/LocationAnalysisScreen.tsx', {
    react: { ...React, useRef: (current: unknown) => ({ current }) }, 'react-native': native, 'react-native-safe-area-context': safe,
    '../components/ui': { Action: 'Action', Card: 'Card', styles: {} },
    '../components/LocationAnalysisPanel': { LocationAnalysisPanel: 'LocationAnalysisPanel' },
    '../function1/Function1Provider': { useFunction1: () => ({ state: { point, inspection, loading: true, error: 'Offline' }, store: { retry: () => retries++ } }) },
  });
  const tree = LocationAnalysisScreen({ navigation: { goBack: () => backs++ } });
  const panel = nodes(tree).find(n => n.type === 'LocationAnalysisPanel');
  assert.equal(panel.props.point, point); assert.equal(panel.props.inspection, inspection); assert.equal(panel.props.loading, true); assert.equal(panel.props.error, 'Offline');
  panel.props.onRetry(); panel.props.onClose(); assert.equal(retries, 1); assert.equal(backs, 1);
});
test('hazard summary effect cancellation rejects late results; errors offer retry and backend fields render', async () => {
  let cleanup: () => void, pending: (value: any) => void;
  let writes: any[] = []; const effects: any[] = [];
  function render(values: any[]) {
    let index = 0;
    const { HazardSummaryScreen } = load('src/screens/HazardSummaryScreen.tsx', {
      react: { ...React, useEffect: (effect: any) => effects.push(effect), useState: () => { const i = index++; const setter = (value: any) => writes.push([i, value]); return [values[i], setter]; } },
      'react-native': native, '../components/ui': { Screen: 'Screen', Card: 'Card', Action: 'Action', styles: {} },
      '../api/hazardSummary': { getHazardSummary: () => new Promise(resolve => { pending = resolve; }), areaLabel: (x: any) => x === null ? 'Unavailable' : `${x} km²`, percentageLabel: (x: any) => `${x}%` },
    });
    return HazardSummaryScreen({ navigation: {} });
  }
  const loading = render([0, null, true, '']); assert.ok(nodes(loading).some(n => n.type === 'ActivityIndicator'));
  cleanup = effects.pop()(); writes = []; cleanup(); pending!({}); await new Promise(resolve => setTimeout(resolve, 0)); assert.deepEqual(writes, []);
  const error = render([0, null, false, 'Offline']); assert.ok(content(error).includes('Offline'));
  nodes(error).find(n => n.type === 'Action').props.onPress(); assert.equal(writes.length, 1);
  const data = { areas: { 'Study AOI': 0 }, scale: 30, denominator: 'analyzed classified land area', rows: [{ label: 'High', area: 7, percentage: 12 }], datasets: ['Real backend source'] };
  const success = render([0, data, false, '']);
  for (const expected of ['0 km²', '7 km²', '12%', 'analyzed classified land area', 'Real backend source', 'DATA_NOT_READY']) assert.ok(content(success).includes(expected), expected);
});
