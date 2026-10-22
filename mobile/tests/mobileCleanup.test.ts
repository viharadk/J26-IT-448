import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

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

test('Expo Router exposes exactly the five core Function 2 workflow routes', () => {
  const routeRoot = path.resolve(__dirname, '..', 'src/app/gis-flood/sar');
  const routes = fs.readdirSync(routeRoot).filter(file => file.endsWith('.tsx')).sort();
  assert.deepEqual(routes, [
    '_layout.tsx', 'analysis-setup.tsx', 'index.tsx', 'map.tsx', 'results.tsx', 'select-image-pair.tsx',
  ]);
  const layout = fs.readFileSync(path.join(routeRoot, '_layout.tsx'), 'utf8');
  for (const route of ['index', 'select-image-pair', 'map', 'analysis-setup', 'results']) {
    assert.match(layout, new RegExp(`name=["']${route}["']`));
  }
});

test('Home retains both user workflows without exposing backend diagnostics', () => {
  const calls: string[] = [];
  const { HomeScreen } = load('src/screens/HomeScreen.tsx', {
    'react-native': { Text: 'Text' },
    'expo-router': { useRouter: () => ({ push: (route: string) => calls.push(route) }) },
    '../components/ui': { Action: 'Action', Card: 'Card', Screen: 'Screen', styles: {} },
  });
  const tree = HomeScreen();
  const actions = nodes(tree).filter(node => node.type === 'Action');
  assert.deepEqual(actions.map(node => node.props.label), ['Explore Function 1 →', 'Explore Function 2']);
  actions.forEach(node => node.props.onPress());
  assert.deepEqual(calls, ['/gis-flood/hazard-map', '/gis-flood/sar']);
  assert.doesNotMatch(content(tree), /backend connection|test backend connection|API availability/i);
  assert.match(content(tree), /Not an operational flood warning service/i);
});

test('removed comparison routes and UI actions have no surviving mobile source references', () => {
  const files = [
    'src/app/gis-flood/sar/_layout.tsx',
    'src/sar/screens/AnalysisResultsScreen.tsx',
    'src/sar/workflow.ts',
  ];
  const source = files.map(file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /ResearchComparison|DynamicResearchComparison/);
  assert.doesNotMatch(source, /Compare this selected analysis|View verified May 2017 case study/);
});
