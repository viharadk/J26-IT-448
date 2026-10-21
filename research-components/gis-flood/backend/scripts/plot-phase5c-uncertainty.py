"""Render scientific figures only from a completed, audited Phase 5C run."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'artifacts' / 'phase5c-python-deps'))
os.environ.setdefault('MPLCONFIGDIR', str(ROOT / 'artifacts' / 'phase5c-matplotlib-cache'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

METHODS = ['yearly-conservative-v1', 'yearly-monthly-dry-v1']
NAMES = ['Conservative', 'Monthly dry']
STAGES = ['raw', 'terrain', 'final']
COLORS = ['#7b8794', '#df8a21', '#147d92']
FOOT = 'Experimental SAR candidates; independent validation: DATA_NOT_READY. Scenarios are dependent sensitivity controls.'


def render(folder):
    folder = Path(folder).resolve()
    source = folder / 'measurement-provenance.json'
    source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    r = json.loads(source.read_text())
    audit = json.loads((folder / 'additional-checks.json').read_text())
    if r['status'] != 'completed' or audit['status'] != 'passed' or audit['resultsSha256'] != source_sha:
        raise ValueError('Completed results with a matching passed audit are required.')
    if r['scientificValidationStatus'] != 'DATA_NOT_READY' or len(r['scenarios']) != 12:
        raise ValueError('Unexpected validation status or comparison matrix.')
    if r['parameters']['sceneIds']['before'].split('/')[-1] != 'S1A_IW_GRDH_1SDV_20170524T002512_20170524T002537_016716_01BC28_3CCB':
        raise ValueError('Unexpected before scene.')
    if r['parameters']['sceneIds']['later'].split('/')[-1] != 'S1B_IW_GRDH_1SDV_20170530T002430_20170530T002501_005820_00A340_FB2A':
        raise ValueError('Unexpected later scene.')
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.spines.top': False,
                         'axes.spines.right': False, 'figure.facecolor': 'white', 'savefig.facecolor': 'white'})
    metadata = {'SourceResults': str(source), 'SourceSha256': source_sha,
                'SceneIds': json.dumps(r['parameters']['sceneIds']), 'Parameters': json.dumps(r['parameters']),
                'EvaluationGrid': json.dumps(r['methodology']['grid']), 'ValidationStatus': r['scientificValidationStatus']}
    files = []

    def scenario(method, stage, kind):
        return next(s for s in r['scenarios'] if s['referenceMethod'] == method and s['stage'] == stage and s['domainKind'] == kind)

    def save(fig, name):
        fig.text(.04, .025, FOOT, fontsize=8, color='#43505c')
        for suffix in ['png', 'svg']:
            dest = folder / f'{name}.{suffix}'
            md = metadata if suffix == 'png' else {'Title': name, 'Description': json.dumps(metadata), 'Creator': Path(__file__).name}
            fig.savefig(dest, dpi=180, metadata=md)
            files.append({'file': dest.name, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
        plt.close(fig)

    fig, axes = plt.subplots(2, 2, figsize=(12, 9), layout=None)
    fig.suptitle('AHP class candidate rates: spatial support and filtering', fontsize=16, x=.04, ha='left', y=.98)
    for row, method in enumerate(METHODS):
        for col, kind in enumerate(['native', 'fixed']):
            ax = axes[row, col]
            for stage, color in zip(STAGES, COLORS):
                s = scenario(method, stage, kind)
                values = [c['candidatePercent'] if c['candidatePercent'] is not None else np.nan for c in s['rows']]
                ax.plot(range(4), values, marker='o', color=color, label=stage.title(), lw=2)
                if stage == 'final':
                    for x, val in enumerate(values):
                        if np.isfinite(val):
                            ax.annotate(f'{val:.2f}%', (x, val), xytext=(0, 8), textcoords='offset points', ha='center', fontsize=8)
            ax.set_title(f'{NAMES[row]} | {kind} domain\nValid area: {s["commonDomainAreaKm2"]:.6f} km²', loc='left', fontsize=11)
            ax.set_xticks(range(4), ['Low', 'Moderate', 'High', 'Very High'])
            ax.set_ylabel('Within-class candidate rate (%)')
            ax.set_ylim(bottom=0, top=max(5, ax.get_ylim()[1] * 1.18))
            ax.grid(axis='y', alpha=.2)
    axes[0, 0].legend(loc='upper left', frameon=False)
    fig.text(.04, .935, 'May 24 → May 30, 2017 | Panel y ranges differ; final-stage rates annotated.', fontsize=10)
    fig.subplots_adjust(left=.08, right=.97, top=.86, bottom=.1, hspace=.52, wspace=.25)
    save(fig, 'candidate-rate-by-class')

    fig, ax = plt.subplots(figsize=(11, 5.7))
    labels, values = [], []
    for method, name in zip(METHODS, NAMES):
        for kind in ['native', 'fixed']:
            labels.append(f'{name} — {kind}')
            values.append(scenario(method, 'raw', kind)['commonDomainAreaKm2'])
    ax.barh(range(4), values, color=['#147d92', '#8bc5cc', '#df8a21', '#edc68f'])
    ax.set_yticks(range(4), labels)
    ax.invert_yaxis()
    ax.set_xscale('log')
    ax.set_xlim(.5, 1600)
    ax.set_xlabel('Valid analysis support (km²; logarithmic axis)')
    for i, value in enumerate(values):
        ax.text(value * 1.08, i, f'{value:.6f} km²', va='center', fontsize=10)
    ax.grid(axis='x', alpha=.2)
    fig.suptitle('Historical-water reference choice changes geographic support', x=.04, ha='left', fontsize=15, y=.97)
    reps = r['sensitivity']['representation']
    fig.text(.04, .86, f'Fixed/native support: conservative {reps[0]["fixedFractionOfNativePercent"]:.3f}% | monthly dry {reps[1]["fixedFractionOfNativePercent"]:.3f}%.\n'
             'The identical fixed mask intersects both methods and all three stage-valid supports.', fontsize=10)
    fig.subplots_adjust(left=.23, right=.96, top=.76, bottom=.17)
    save(fig, 'valid-support')

    fig, axes = plt.subplots(1, 2, figsize=(12, 5.9))
    for ax, kind in zip(axes, ['native', 'fixed']):
        for method, name, color, marker in zip(METHODS, NAMES, ['#147d92', '#df8a21'], ['o', 's']):
            vals = [scenario(method, stage, kind)['groupedComparison']['higherToLowerRateRatio'] for stage in STAGES]
            ax.plot(range(3), [v if v is not None else np.nan for v in vals], marker=marker, label=name, color=color, lw=2)
            for i, val in enumerate(vals):
                if val is not None:
                    ax.annotate(f'{val:.3f}', (i, val), xytext=(0, 10 if method == METHODS[0] else -18), textcoords='offset points', ha='center', fontsize=9, color=color)
        ax.axhline(1, color='#7b8794', linestyle='--', lw=1)
        ax.set_xticks(range(3), ['Raw', 'Terrain', 'Final'])
        ax.set_title(f'{kind.title()} domains', loc='left')
        ax.set_ylabel('High/Very High ÷ Low/Moderate rate ratio')
        ax.set_xlim(-.2, 2.2)
        ax.set_ylim(.7, 14 if kind == 'native' else 2.3)
        ax.grid(axis='y', alpha=.2)
    axes[0].legend(frameon=False, loc='center left')
    fig.suptitle('Grouped candidate-rate ratio is sensitive to analysis choices', x=.04, ha='left', fontsize=15, y=.97)
    fig.text(.04, .88, 'May 2017 | Panel y ranges differ. Dashed line: equal grouped rates; no significance or accuracy inference.', fontsize=10)
    fig.subplots_adjust(left=.08, right=.97, top=.77, bottom=.15, wspace=.25)
    save(fig, 'grouped-rate-ratio-sensitivity')
    manifest = {'status': 'completed', 'sourceResultsSha256': source_sha, **metadata, 'files': files,
                'rendererSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'matplotlibVersion': matplotlib.__version__}
    (folder / 'chart-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'status': 'completed', 'charts': [f['file'] for f in files]}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifact_folder')
    render(parser.parse_args().artifact_folder)
