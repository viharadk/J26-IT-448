import { analyzeSar, checkSarTile, filtersFromDraft, SarAnalysis, SarFilterDraft, SarPreview, SarReferenceMethod } from '../api/sar';

export type AnalysisPhase = 'idle' | 'running' | 'tiles' | 'success' | 'error' | 'tile-error';
export interface AnalysisContext {
  before: string; later: string; preview: SarPreview | null; supported: boolean; expired: boolean;
}
export function analysisPrerequisite(context: AnalysisContext): string | null {
  if (!context.before || !context.later) return 'Select both a before scene and a later scene first.';
  if (!context.supported) return 'Choose a compatible IW/VV 10 m pair with matching orbit, consistent timestamps and at least 90% joint footprint.';
  if (!context.preview || context.preview.quality.scenes.before.sceneId !== context.before || context.preview.quality.scenes.later.sceneId !== context.later) {
    return 'Load live before / later / change maps for this selected pair first.';
  }
  if (context.expired) return 'The live map session has expired. Refresh live maps, then run analysis again.';
  return null;
}

// Keep request completion separate from tile checks: areas are available even
// when a phone cannot download a candidate tile. Identity guards prevent an old
// request from updating a different selection or an unmounted screen.
export async function executeAnalysis({ context, filters, referenceMethod, ticket, onPhase, onResult }: {
  context: AnalysisContext; filters: SarFilterDraft; referenceMethod: SarReferenceMethod;
  ticket: { signal: AbortSignal; isCurrent: () => boolean };
  onPhase: (phase: AnalysisPhase, detail?: string) => void; onResult: (result: SarAnalysis) => void;
}, dependencies = { analyze: analyzeSar, checkTile: checkSarTile }) {
  let receivedResult = false;
  try {
    const prerequisite = analysisPrerequisite(context);
    if (prerequisite) throw new Error(prerequisite);
    const configuration = filtersFromDraft(filters);
    onPhase('running');
    const result = await dependencies.analyze(context.before, context.later, ticket.signal, configuration, referenceMethod);
    if (!ticket.isCurrent()) return;
    receivedResult = true;
    onResult(result);
    onPhase('tiles');
    const sample = result.candidateCoordinates[0] || context.preview!.quality.studyArea.center;
    await Promise.all(Object.values(result.layers || { raw: result.layer }).map(layer => dependencies.checkTile(layer, sample, ticket.signal)));
    if (ticket.isCurrent()) onPhase('success');
  } catch (failure) {
    if (ticket.isCurrent()) onPhase(receivedResult ? 'tile-error' : 'error', failure instanceof Error ? failure.message : 'SAR request failed. Retry the operation.');
  }
}
