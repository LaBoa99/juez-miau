import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subscription, catchError, of, switchMap, takeWhile, timer } from 'rxjs';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CompareMode,
  ILanguage,
  IDetectedSignature,
  IProblemDetail,
  IProblemSignature,
  ISignatureDetection,
  ISignatureParam,
  ITestCase,
  ITestRun,
  ITestsetDetail,
  ProblemStatus,
  ScalarType,
  TestCaseOrigin,
  TestCaseVisibility,
  TestsetStatus,
  TypeRef,
  Verdict,
} from '@concurso/shared-types';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { FileDrop } from '../../../../shared/ui/file-drop.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { TestsetStatusPipe } from '../../../../shared/pipes/testset-status.pipe';
import {
  MAX_ARRAY_DEPTH,
  SCALAR_TYPES,
  scalarBase,
  signatureToString,
  typeToString,
  typeToUi,
  uiToType,
} from '../../../../shared/type-ref';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { ProblemsService } from '../../../problems/data/problems.service';
import { EditionLanguagesService } from '../../../editions/edition-languages/data/edition-languages.service';
import { TestsetsService } from '../../data/testsets.service';
import { RandomGroup, groupsToSchema, schemaToGroups } from './random-schema';
import { TestRunModal } from '../test-run-modal/test-run-modal';
import { CodeBlock } from '../../../../shared/ui/code-block.component';
import { clearDraft, loadDraft, saveDraft } from '../../../../shared/draft';
import { TooltipDirective } from '../../../../shared/ui/tooltip.directive';

// Identificador válido (igual que el backend): letras, dígitos y _, hasta 64, sin empezar por dígito.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

type PipeStage = 'todo' | 'active' | 'done' | 'warn' | 'error';

interface SolutionDraft {
  source: string;
  lang: string | null;
  sig: { functionName: string; params: { name: string; base: ScalarType; depth: number }[]; returnBase: ScalarType; returnDepth: number } | null;
  // Resultado de la lectura (función elegida, si compila): al volver al paso se ve igual que antes
  detection?: ISignatureDetection | null;
}

interface EnabledLanguage {
  id: string;
  code: string;
  ext: string;
  // Language.time_multiplier: el límite real de un envío en ese lenguaje
  multiplier: number;
}

// Pasos de los casos de prueba; la página del problema muestra uno a la vez.
// La firma se arma con la solución oficial y la evaluación vive dentro de Construir.
export type TestsetStep = 'solucion' | 'casos' | 'construir';
export type TestsetProgress = Record<TestsetStep, boolean>;
type Requirements = { firma: boolean; solucion: boolean; evaluacion: boolean; casos: boolean; construir: boolean };

// Versión que se abre al entrar: la última si no está construida, si no la vigente.
export function defaultTestsetId(p: IProblemDetail): number | null {
  const last = p.testsets.at(-1);
  const inProgress = last && last.status !== TestsetStatus.READY ? last.id : null;
  return inProgress ?? p.currentTestsetId ?? last?.id ?? null;
}

// Completado de cada paso de la barra.
export function testsetProgress(p: IProblemDetail, t: ITestsetDetail | null): TestsetProgress {
  const r = requirements(p, t);
  return { solucion: r.firma && r.solucion, casos: r.casos, construir: r.construir };
}

// Lo que valida el backend al construir.
function requirements(p: IProblemDetail, t: ITestsetDetail | null): Requirements {
  const cases = t?.cases ?? [];
  const tol = t?.floatTolerance ?? null;
  return {
    firma: (p.signature?.params.length ?? 0) > 0,
    solucion: t?.refSolutionId != null,
    evaluacion:
      t?.compareMode === CompareMode.CHECKER
        ? t.checkerId != null
        : t?.compareMode === CompareMode.TOLERANCE
          ? tol != null && tol > 0 && tol <= 1
          : true, // exacta siempre está configurada (es el valor por defecto)
    casos: cases.some((c) => c.visibility === TestCaseVisibility.PUBLIC),
    construir: t?.status === TestsetStatus.READY,
  };
}
// Formularios que se abren dentro del paso Casos (uno a la vez).
type PanelKey = 'generador' | 'aleatorios' | 'pegar';

const STEP_TEXT: Record<TestsetStep, { title: string; hint: string }> = {
  solucion: {
    title: 'Solución y firma',
    hint: 'Sube la solución oficial: de ella se lee la firma (la función que implementa el concursante) y con ella se calculan las salidas esperadas.',
  },
  casos: { title: 'Casos de prueba', hint: 'Al menos un caso público (sale como ejemplo en el enunciado). Agrega manuales, aleatorios por rangos o con un generador.' },
  construir: {
    title: 'Evaluación y proponer',
    hint: 'Revisa cómo se comparan las salidas y los límites; construir ejecuta la solución oficial en cada caso para obtener las salidas esperadas.',
  },
};

@Component({
  selector: 'oj-testset-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    TestRunModal,
    RouterLink,
    ButtonDirective,
    Badge,
    Alert,
    FormField,
    Modal,
    FileDrop,
    ConfirmDialog,
    TestsetStatusPipe,
    CodeBlock,
    TooltipDirective,
  ],
  templateUrl: './testset-workspace.html',
  styleUrls: ['./testset-workspace.css', './testset-workspace.boxes.css', './testset-workspace.detect.css'],
})
export class TestsetWorkspace {
  private readonly problemsService = inject(ProblemsService);
  private readonly languagesService = inject(EditionLanguagesService);
  private readonly service = inject(TestsetsService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  // El problema lo carga la página que contiene este bloque; `changed` le pide recargarlo.
  readonly problem = input.required<IProblemDetail>();
  readonly step = input.required<TestsetStep>();
  // Problema de otro juez: se ve todo pero no se edita (el backend también lo rechaza)
  readonly readOnly = input(false);
  readonly changed = output<void>();
  // Qué pasos están completos (para la barra de la página) y "ya guardé, sigue al siguiente"
  readonly progress = output<TestsetProgress>();
  readonly next = output<void>();
  // Pasos que la advertencia del paso actual marca como afectados (la barra los pinta en amarillo)
  readonly affects = output<TestsetStep[]>();
  private readonly problemId = computed(() => this.problem().id);

  protected readonly testset = signal<ITestsetDetail | null>(null);
  private readonly loaded = computed(() => this.testset() !== null);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly loadError = signal(false);
  protected readonly actionError = signal<string | null>(null);
  private readonly languages = signal<EnabledLanguage[]>([]);

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly signature = computed(() => this.problem()?.signature ?? null);
  protected readonly signatureText = computed(() => {
    const s = this.signature();
    return s ? signatureToString(s) : null;
  });
  protected readonly currentId = computed(() => this.problem()?.currentTestsetId ?? null);
  protected readonly isCurrent = computed(() => this.testset()?.id === this.currentId());
  protected readonly published = computed(() => this.problem()?.status === ProblemStatus.PUBLISHED);
  // Propuesto o aceptado: la firma ya no cambia (el backend solo la deja cambiar en borrador)
  protected readonly proposed = computed(() => this.problem()?.status !== ProblemStatus.DRAFT);
  protected readonly editable = computed(() => {
    const s = this.testset()?.status;
    return !this.readOnly() && (s === TestsetStatus.DRAFT || s === TestsetStatus.FAILED);
  });
  // La firma solo cambia con el problema en borrador y su testset editable (DRAFT/FAILED).
  protected readonly signatureEditable = computed(() => !this.proposed() && this.editable());

  protected readonly caseStats = computed(() => {
    const cases = this.testset()?.cases ?? [];
    const pub = cases.filter((c) => c.visibility === TestCaseVisibility.PUBLIC).length;
    return { total: cases.length, pub, hidden: cases.length - pub };
  });

  // Resumen con singular/plural correctos: "1 caso · 1 público · 0 ocultos".
  protected readonly caseSummaryLine = computed(() => {
    const s = this.caseStats();
    const caso = s.total === 1 ? 'caso' : 'casos';
    const pub = s.pub === 1 ? 'público' : 'públicos';
    const oc = s.hidden === 1 ? 'oculto' : 'ocultos';
    return `${s.total} ${caso} · ${s.pub} ${pub} · ${s.hidden} ${oc}`;
  });

  // Casos por grupo, en orden de aparición; los manuales (group null) van como "Manuales"
  protected readonly caseGroups = computed(() => {
    const groups = new Map<string | null, ITestCase[]>();
    for (const c of this.testset()?.cases ?? []) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
    return [...groups].map(([key, cases]) => ({
      key,
      label: key ?? 'Sin grupo',
      cases,
      pub: cases.filter((c) => c.visibility === TestCaseVisibility.PUBLIC).length,
    }));
  });

  // Grupos abiertos en la tabla (llave '' = sin grupo). Con un solo grupo se muestra abierto
  private readonly openGroups = signal<ReadonlySet<string>>(new Set());

  isGroupOpen(key: string | null): boolean {
    return this.caseGroups().length === 1 || this.openGroups().has(key ?? '');
  }

  toggleGroup(key: string | null): void {
    const next = new Set(this.openGroups());
    if (!next.delete(key ?? '')) next.add(key ?? '');
    this.openGroups.set(next);
  }

  protected readonly noPublicCase = computed(() => this.caseStats().pub === 0);

  // La firma debe tener parámetros para poder armar un caso.
  protected readonly hasParams = computed(() => (this.signature()?.params.length ?? 0) > 0);

  // ─── Modo de evaluación vigente (del testset), para los pasos y el resumen ───
  protected readonly compareMode = signal<CompareMode>(CompareMode.EXACT);

  private readonly done = computed(() => requirements(this.problem(), this.testset()));

  // Construir exige los 4 pasos previos completos.
  protected readonly canBuild = computed(() => {
    const d = this.done();
    return this.editable() && d.firma && d.solucion && d.evaluacion && d.casos;
  });
  protected readonly built = computed(() => this.testset()?.status === TestsetStatus.READY);
  // Verificar: hace falta la solución oficial y algún caso; no tiene sentido ya construido



  // Última plantilla puesta: si el juez no la ha tocado, cambiar de lenguaje la reemplaza; si ya escribió, no
  private lastTemplate = '';

  private fillGeneratorTemplate(languageId: string | null): void {
    if (this.sourceKind() !== 'generator' || !languageId) return;
    const current = this.sourceText();
    if (current.trim() && current !== this.lastTemplate) return;
    this.service.generatorTemplate(this.problemId(), languageId).subscribe({
      next: ({ source }) => {
        // Pudo escribir mientras llegaba la plantilla
        if (this.sourceText() !== current || this.sourceLang.value !== languageId) return;
        this.lastTemplate = source;
        this.sourceText.set(source);
      },
      error: (err) => this.sourceError.set(message(err, 'No se pudo cargar la plantilla del generador.')),
    });
  }

  downloadGeneratorTemplate(): void {
    const languageId = this.sourceLang.value;
    if (!languageId) return;
    this.service.generatorTemplate(this.problemId(), languageId).subscribe({
      next: ({ fileName, source }) => {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => this.sourceError.set(message(err, 'No se pudo descargar la plantilla.')),
    });
  }

  protected readonly buildReqs = computed(() => [
    { label: 'Evaluación configurada', ok: this.done().evaluacion },
    { label: 'Firma con al menos un parámetro', ok: this.done().firma },
    { label: 'Solución oficial', ok: this.done().solucion },
    { label: 'Al menos un caso, con uno público', ok: this.done().casos },
  ]);

  protected readonly stepTitle = computed(() => STEP_TEXT[this.step()].title);
  protected readonly stepHint = computed(() => STEP_TEXT[this.step()].hint);

  // Qué rompe en los pasos siguientes editar este (solo si ya hay algo después que cuidar).
  protected readonly warning = computed<string | null>(() => {
    const t = this.testset();
    if (!t || !this.editable()) return null;
    const hasCases = t.cases.length > 0 || t.schema !== null;
    switch (this.step()) {
      case 'solucion':
        return t.refSolutionId !== null && hasCases
          ? 'Reemplazar la solución oficial cambia las salidas esperadas de todos los casos, y una firma nueva debe seguir siendo válida para los casos y rangos aleatorios (si no, no se guarda).'
          : null;
      case 'construir':
        return this.evalOpen() && hasCases ? 'Los límites y la forma de comparar cambian cómo se juzgan todos los casos y los envíos.' : null;
      default:
        return null;
    }
  });

  protected readonly affectedSteps = computed<TestsetStep[]>(() => {
    if (!this.warning()) return [];
    return this.step() === 'solucion' ? ['casos', 'construir'] : [];
  });

  // Formulario abierto dentro del paso Casos (generador o aleatorios).
  protected readonly openPanel = signal<PanelKey | null>(null);
  protected readonly expanded = this.openPanel.asReadonly();

  open(panel: PanelKey): void {
    this.openPanel.set(panel);
  }

  closePanel(): void {
    this.openPanel.set(null);
  }

  private initPanel(panel: PanelKey | null): void {
    if (panel === 'generador') this.initSource('generator');
    else if (panel === 'aleatorios') this.initRandom();
    else if (panel === 'pegar') {
      this.pasteText.set('');
      this.pasteErrors.set([]);
    }
  }

  // ─── Pegar varios casos (un JSON por línea) ───
  protected readonly pasteText = signal('');
  protected readonly pasteVisibility = signal<TestCaseVisibility>(TestCaseVisibility.HIDDEN);
  protected readonly pasteGroup = signal('');
  protected readonly pasteErrors = signal<string[]>([]);
  protected readonly pasteSaving = signal(false);
  protected readonly pasteExample = computed(() =>
    JSON.stringify(Object.fromEntries((this.signature()?.params ?? []).map((p) => [p.name, p.type.type === 'array' ? [] : p.type.type === 'string' ? '' : 0]))),
  );

  savePaste(): void {
    const t = this.testset();
    const names = (this.signature()?.params ?? []).map((p) => p.name);
    if (!t) return;
    const errors: string[] = [];
    const inputs: Record<string, unknown>[] = [];
    this.pasteText()
      .split('\n')
      .forEach((line, i) => {
        if (!line.trim()) return;
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch {
          errors.push(`Línea ${i + 1}: no es JSON válido.`);
          return;
        }
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`Línea ${i + 1}: debe ser un objeto {…} con un campo por parámetro.`);
          return;
        }
        const keys = Object.keys(value);
        const missing = names.filter((n) => !keys.includes(n));
        const extra = keys.filter((k) => !names.includes(k));
        if (missing.length) errors.push(`Línea ${i + 1}: falta ${missing.join(', ')}.`);
        if (extra.length) errors.push(`Línea ${i + 1}: sobra ${extra.join(', ')}.`);
        inputs.push(value as Record<string, unknown>);
      });
    if (!errors.length && !inputs.length) errors.push('Pega al menos un caso.');
    if (errors.length) {
      this.pasteErrors.set(errors.slice(0, 5));
      return;
    }
    this.pasteErrors.set([]);
    this.pasteSaving.set(true);
    const visibility = this.pasteVisibility();
    const group = this.pasteGroup().trim() || null;
    this.service.addCases(t.id, { cases: inputs.map((input) => ({ input, visibility, group })) }).subscribe({
      next: () => {
        this.pasteSaving.set(false);
        this.openPanel.set(null);
        this.loadTestset(t.id);
      },
      error: (err) => {
        this.pasteSaving.set(false);
        this.pasteErrors.set([message(err, 'No se agregaron los casos: revisa que los valores tengan el tipo de cada parámetro de la firma.')]);
      },
    });
  }

  pinCase(c: ITestCase): void {
    const t = this.testset();
    if (!t) return;
    this.busyKey.set('pin:' + c.id);
    this.service.pinCase(t.id, c.id).subscribe({
      next: () => this.loadTestset(t.id),
      error: (err) => this.actionFailed(err, 'No se pudo fijar el caso como manual.'),
    });
  }

  // Botón cuya acción está en curso: muestra un spinner hasta que la tabla se recarga
  protected readonly busyKey = signal<string | null>(null);

  private actionFailed(err: unknown, fallback: string): void {
    this.busyKey.set(null);
    this.actionError.set(message(err, fallback));
  }

  // El formulario del paso visible ya está abierto: se prepara al entrar al paso.
  private initStep(step: TestsetStep): void {
    this.draftReady = false;
    if (step === 'solucion') {
      this.initSignature();
      this.initSource('ref');
      this.restoreSolutionDraft();
      this.draftReady = true;
    } else if (step === 'construir') {
      this.evalOpen.set(false);
      this.pipeSub?.unsubscribe();
      this.pipe.set({ verify: 'todo' });
      this.verifyRun.set(null);
      this.resumeVerify();
    }
  }

  // ─── Borrador del paso Solución y firma (localStorage) ───
  private draftReady = false;
  protected readonly draftRestored = signal(false);
  private readonly draftKey = computed(() => `solucion:${this.testset()?.id ?? 0}`);

  private restoreSolutionDraft(): void {
    const draft = loadDraft<SolutionDraft>(this.draftKey());
    this.draftRestored.set(false);
    if (!draft || !this.editable()) return;
    this.sourceText.set(draft.source);
    this.sourceLang.setValue(draft.lang);
    if (draft.sig && this.signatureEditable()) {
      this.sigParams.clear();
      for (const p of draft.sig.params) this.sigParams.push(this.paramGroup(p.name, p.base, p.depth));
      this.signatureForm.patchValue({ functionName: draft.sig.functionName, returnBase: draft.sig.returnBase, returnDepth: draft.sig.returnDepth });
      this.signatureForm.markAsDirty();
      // La firma recuperada manda: no se vuelve a leer del mismo código
      this.lastDetected = (draft.lang ?? '') + '\u0000' + draft.source;
    }
    if (draft.detection?.status === 'done') {
      this.detection.set(draft.detection);
      this.lastDetected = (draft.lang ?? '') + '\u0000' + draft.source;
    }
    this.draftRestored.set(true);
  }

  private saveSolutionDraft(): void {
    if (!this.draftReady || this.step() !== 'solucion' || !this.editable()) return;
    const sig = this.signatureForm.dirty ? (this.signatureForm.getRawValue() as SolutionDraft['sig']) : null;
    if (!this.sourceText().trim() && !sig) clearDraft(this.draftKey());
    else {
      const detection = this.detection()?.status === 'done' ? this.detection() : null;
      saveDraft(this.draftKey(), { source: this.sourceText(), lang: this.sourceLang.value, sig, detection } satisfies SolutionDraft);
    }
  }

  discardSolutionDraft(): void {
    clearDraft(this.draftKey());
    this.draftRestored.set(false);
    this.initSignature();
    this.initSource('ref');
  }

  // ─── Firma ───
  protected readonly scalarTypes = SCALAR_TYPES;
  protected readonly depths = Array.from({ length: MAX_ARRAY_DEPTH + 1 }, (_, i) => i);
  protected readonly signatureSaving = signal(false);
  protected readonly signatureError = signal<string | null>(null);
  protected readonly signatureForm = this.fb.group({
    functionName: ['', [Validators.required, Validators.pattern(IDENTIFIER)]],
    params: this.fb.array<FormGroup>([]),
    returnBase: ['int' as ScalarType],
    returnDepth: [0],
  });

  get sigParams(): FormArray<FormGroup> {
    return this.signatureForm.get('params') as FormArray<FormGroup>;
  }

  private paramGroup(name = '', base: ScalarType = 'int', depth = 0): FormGroup {
    return this.fb.group({ name: [name, [Validators.required, Validators.pattern(IDENTIFIER)]], base: [base], depth: [depth] });
  }

  private initSignature(): void {
    this.signatureError.set(null);
    const sig = this.signature();
    this.sigParams.clear();
    if (sig) {
      const ret = typeToUi(sig.returns);
      this.signatureForm.patchValue({ functionName: sig.functionName, returnBase: ret.base, returnDepth: ret.depth });
      for (const p of sig.params) {
        const ui = typeToUi(p.type);
        this.sigParams.push(this.paramGroup(p.name, ui.base, ui.depth));
      }
    } else {
      this.signatureForm.patchValue({ functionName: '', returnBase: 'int', returnDepth: 0 });
      this.sigParams.push(this.paramGroup());
    }
  }

  addParam(): void {
    this.sigParams.push(this.paramGroup());
  }

  removeParam(i: number): void {
    this.sigParams.removeAt(i);
  }

  // Firma del formulario lista para guardar; null si tiene errores (los deja en signatureError)
  private buildSignature(): IProblemSignature | null {
    if (this.signatureForm.invalid) {
      this.signatureForm.markAllAsTouched();
      this.signatureError.set(
        'Revisa la firma: el nombre de la función y de cada parámetro son obligatorios y deben ser identificadores válidos (letras, dígitos y _).',
      );
      return null;
    }
    const raw = this.signatureForm.getRawValue();
    const paramRows = raw.params as { name: string; base: ScalarType; depth: number }[];

    // Sin parámetros no se pueden armar casos de prueba: no guardamos.
    if (paramRows.length === 0) {
      this.signatureError.set('Agrega al menos un parámetro para poder crear casos de prueba.');
      return null;
    }

    // Nombres de parámetro únicos (el backend también lo valida, pero avisamos antes de enviar).
    const names = paramRows.map((p) => p.name);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) {
      this.signatureError.set(`El parámetro "${dup}" está repetido. Usa nombres únicos.`);
      return null;
    }

    this.signatureError.set(null);
    return {
      functionName: raw.functionName!,
      params: paramRows.map((p) => ({ name: p.name, type: uiToType(p.base, p.depth) })),
      returns: uiToType(raw.returnBase as ScalarType, raw.returnDepth as number),
    };
  }

  // Paso "Solución y firma": guarda la firma (si cambió) y luego la solución (si hay código nuevo)
  saveSolution(): void {
    const t = this.testset();
    if (!t) return;
    const signatureChanged = this.signatureEditable() && (!this.signature() || this.signatureForm.dirty);
    const sig = signatureChanged ? this.buildSignature() : null;
    if (signatureChanged && !sig) return;
    if (!this.sourceText() && t.refSolutionId === null && this.editable()) {
      this.sourceError.set('Sube o pega la solución oficial.');
      return;
    }
    if (this.sourceText() && this.sourceLang.invalid) {
      this.sourceError.set('Elige el lenguaje de la solución.');
      return;
    }
    this.sourceError.set(null);
    this.signatureSaving.set(true);
    const saveSource = (): Observable<unknown> =>
      this.sourceText() ? this.service.setRefSolution(t.id, { languageId: this.sourceLang.value!, source: this.sourceText() }) : of(null);
    const saveSignature: Observable<unknown> = sig ? this.problemsService.updateSignature(this.problemId(), sig) : of(null);
    saveSignature
      .pipe(
        catchError((err: unknown) => {
          this.signatureError.set(message(err, 'No se pudo guardar la firma.'));
          throw err;
        }),
        switchMap(() => saveSource()),
      )
      .subscribe({
        next: () => {
          this.signatureSaving.set(false);
          if (sig) {
            this.signatureForm.markAsPristine();
            this.loadProblem();
          }
          clearDraft(this.draftKey());
          this.draftRestored.set(false);
          this.loadTestset(t.id);
          this.next.emit();
        },
        error: (err) => {
          this.signatureSaving.set(false);
          if (!this.signatureError()) this.sourceError.set(message(err, 'No se pudo guardar la solución oficial.'));
        },
      });
  }

  // ─── Firma detectada desde la solución (la lee y la compila el worker) ───
  protected readonly detection = signal<ISignatureDetection | null>(null);
  protected readonly detecting = computed(() => {
    const status = this.detection()?.status;
    return status === 'queued' || status === 'running';
  });
  private detectSub: Subscription | null = null;

  // Código y lenguaje como signals: la firma se vuelve a leer sola cuando cambian (con debounce)
  private detectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDetected = '';

  private scheduleDetection(): void {
    const text = this.sourceText();
    const lang = this.sourceLangValue();
    if (this.detectTimer) clearTimeout(this.detectTimer);
    if (this.step() !== 'solucion' || this.sourceKind() !== 'ref' || !text.trim() || !lang) return;
    const key = lang + '\u0000' + text;
    if (key === this.lastDetected) return;
    this.detectTimer = setTimeout(() => {
      this.lastDetected = key;
      this.detectSignature();
    }, 800);
  }

  detectSignature(functionName?: string): void {
    const t = this.testset();
    if (!t || !this.signatureEditable() || !this.sourceText() || !this.sourceLang.value) return;
    this.detectSub?.unsubscribe();
    this.sigEditing.set(false);
    this.detection.set({ id: '', status: 'queued', candidates: [], chosen: null, compiles: null, compileLog: null, error: null });
    this.detectSub = this.service
      .detectSignature(t.id, { languageId: this.sourceLang.value, source: this.sourceText(), functionName })
      .pipe(
        switchMap((job) => timer(0, 1000).pipe(switchMap(() => this.service.getSignatureDetection(t.id, job.id)))),
        takeWhile((d) => d.status === 'queued' || d.status === 'running', true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (d) => {
          this.detection.set(d);
          if (d.status === 'done' && d.chosen !== null) this.applyDetected(d.candidates[d.chosen]);
        },
        error: () => this.detection.set({ id: '', status: 'failed', candidates: [], chosen: null, compiles: null, compileLog: null, error: 'request' }),
      });
  }

  // Llena el formulario de firma con la detectada; los tipos que no se leyeron quedan en int para elegirlos
  private applyDetected(d: IDetectedSignature): void {
    const ret = d.returns ? typeToUi(d.returns) : { base: 'int' as ScalarType, depth: 0 };
    this.sigParams.clear();
    for (const p of d.params) {
      const ui = p.type ? typeToUi(p.type) : { base: 'int' as ScalarType, depth: 0 };
      this.sigParams.push(this.paramGroup(p.name, ui.base, ui.depth));
    }
    this.signatureForm.patchValue({ functionName: d.functionName, returnBase: ret.base, returnDepth: ret.depth });
    this.signatureForm.markAsDirty();
    this.signatureError.set(null);
  }

  // Java y C#: el juez busca la función en `class Main`. Si la solución usa otro nombre, se ofrece renombrarla
  protected readonly classRename = computed(() => {
    const code = this.languageCode(this.sourceLangValue());
    const text = this.sourceText();
    if (!['java', 'csharp'].includes(code) || /\bclass\s+Main\b/.test(text)) return null;
    const names = [...text.matchAll(/\bclass\s+([A-Za-z_]\w*)/g)].map((m) => m[1]);
    // La clase con métodos static es la de la solución; las demás suelen ser auxiliares
    const from = names.find((n) => new RegExp('\\bclass\\s+' + n + '\\b[^{]*\\{[\\s\\S]*?\\bstatic\\b').test(text)) ?? names[0];
    // En C# un método no puede llamarse como su clase: el Main() de prueba se vuelve MainLocal()
    const mainMethod = code === 'csharp' && /\bstatic\s+[\w<>\[\]]+\s+Main\s*\(/.test(text);
    return from ? { from, mainMethod } : null;
  });

  renameClassToMain(): void {
    const r = this.classRename();
    if (!r) return;
    let text = this.sourceText();
    if (r.mainMethod) text = text.replace(/(\bstatic\s+[\w<>\[\]]+\s+)Main(\s*\()/g, '$1MainLocal$2');
    this.sourceText.set(text.replace(new RegExp('\\b' + r.from + '\\b', 'g'), 'Main'));
  }

  // Estado de la lectura en un solo indicador: girando mientras trabaja, luego ✓ / ✕ / !
  protected readonly statusState = computed<'active' | 'done' | 'error' | 'warn'>(() => {
    const d = this.detection();
    if (!d || d.status === 'queued' || d.status === 'running') return 'active';
    if (d.status === 'failed' || d.compiles === false) return 'error';
    if (d.candidates.length === 0 || d.chosen === null || d.compiles === null) return 'warn';
    return 'done';
  });
  protected readonly statusIcon = computed(() => ({ active: '', done: '✓', error: '✕', warn: '!' })[this.statusState()]);
  protected readonly progressText = computed(() => {
    const d = this.detection();
    if (!d || d.status === 'queued') return 'Leyendo la firma de la solución…';
    if (d.status === 'running') return 'Compilando la solución con la firma leída…';
    if (d.status === 'failed') return 'No se pudo leer la firma.';
    if (d.candidates.length === 0) return 'No se encontró la función.';
    if (d.chosen === null) return 'Falta elegir la función.';
    if (d.compiles === true) return 'Firma leída: tu solución compila con ella.';
    if (d.compiles === false) return 'La solución no compila con la firma leída.';
    return 'Firma leída; faltan tipos por revisar.';
  });

  // Firma detectada y comprobada: se muestra fija; "Editar firma" abre el formulario
  protected readonly detectedOk = computed(() => {
    const d = this.detection();
    return d?.status === 'done' && d.chosen !== null && d.compiles === true;
  });
  protected readonly sigEditing = signal(false);

  // Tarjeta fija en vez del formulario: la detectada que compila, o la ya guardada sin cambios
  protected readonly sigCard = computed<string | null>(() => {
    this.signatureValue();
    if (this.sigEditing()) return null;
    const d = this.detection();
    if (this.detectedOk()) return this.detectedText(d!.candidates[d!.chosen!]);
    if (!d && this.signature() && !this.signatureForm.dirty) return this.signatureText();
    return null;
  });

  // Parámetros (y el retorno) cuyo tipo no se pudo leer: el juez los revisa
  protected readonly untypedNames = computed(() => {
    const d = this.detection();
    const c = d?.chosen != null ? d.candidates[d.chosen] : null;
    if (!c) return [];
    return [...c.params.filter((p) => p.type === null).map((p) => p.name), ...(c.returns === null ? ['el retorno'] : [])];
  });

  detectedText(d: IDetectedSignature): string {
    const type = (t: TypeRef | null) => (t ? typeToString(t) : '?');
    return `${d.functionName}(${d.params.map((p) => `${p.name}: ${type(p.type)}`).join(', ')}): ${type(d.returns)}`;
  }

  // ─── Evaluación ───
  // Tarjetas con título y "cuándo usarla"; la seleccionada muestra sus campos.
  protected readonly evalCards = [
    { mode: CompareMode.EXACT, title: 'Exacta', when: 'La salida debe coincidir carácter por carácter.' },
    { mode: CompareMode.TOLERANCE, title: 'Con tolerancia', when: 'Para resultados con decimales; acepta una diferencia pequeña.' },
    { mode: CompareMode.CHECKER, title: 'Checker', when: 'Cuando hay varias respuestas válidas; un programa decide.' },
  ];
  protected readonly evalMode = signal<CompareMode>(CompareMode.EXACT);
  protected readonly evalSaving = signal(false);
  protected readonly evalError = signal<string | null>(null);
  protected readonly evalForm = this.fb.group({
    timeLimitMs: [1000, [Validators.required]],
    memoryLimitMb: [256, [Validators.required]],
    floatTolerance: [null as number | null],
  });
  // Checker: se sube dentro del formulario de evaluación (solo con la tarjeta "Checker").
  protected readonly checkerLang = this.fb.control<string | null>(null);
  protected readonly checkerText = signal('');
  protected readonly checkerFileName = signal('');

  private initEval(): void {
    const t = this.testset();
    if (!t) return;
    this.evalError.set(null);
    this.evalMode.set(t.compareMode);
    this.evalForm.reset({ timeLimitMs: t.timeLimitMs, memoryLimitMb: t.memoryLimitMb, floatTolerance: t.floatTolerance });
    this.checkerLang.reset(null);
    this.checkerText.set('');
    this.checkerFileName.set('');
  }

  setEvalMode(mode: CompareMode): void {
    this.evalMode.set(mode);
    this.evalError.set(null);
  }

  onCheckerFile(file: File): void {
    this.checkerFileName.set(file.name);
    file.text().then((text) => this.checkerText.set(text));
  }

  saveEval(): void {
    const t = this.testset();
    if (!t) return;
    const raw = this.evalForm.getRawValue();
    const mode = this.evalMode();
    this.evalError.set(null);

    // La tolerancia debe quedar en (0, 1] (lo exige el backend); validamos antes de enviar.
    const tolerance = mode === CompareMode.TOLERANCE ? raw.floatTolerance : null;
    if (mode === CompareMode.TOLERANCE && (tolerance == null || tolerance <= 0 || tolerance > 1)) {
      this.evalError.set('La tolerancia debe ser mayor que 0 y como máximo 1.');
      return;
    }

    if (mode === CompareMode.CHECKER && !this.hasParams()) {
      this.evalError.set('El checker necesita la firma: defínela primero (paso Solución y firma) y vuelve a elegir Checker.');
      return;
    }

    // Checker: hace falta uno (el ya guardado o el que se sube ahora).
    const uploadingChecker = mode === CompareMode.CHECKER && !!this.checkerText();
    if (mode === CompareMode.CHECKER && t.checkerId == null && !uploadingChecker) {
      this.evalError.set('Sube o pega el programa checker y elige su lenguaje.');
      return;
    }
    if (uploadingChecker && this.checkerLang.invalid) {
      this.evalError.set('Elige el lenguaje del checker.');
      return;
    }

    this.evalSaving.set(true);
    const patch = () =>
      this.service
        .update(t.id, { compareMode: mode, timeLimitMs: raw.timeLimitMs!, memoryLimitMb: raw.memoryLimitMb!, floatTolerance: tolerance })
        .subscribe({
          next: () => {
            this.evalSaving.set(false);
            this.compareMode.set(mode);
            this.loadTestset(t.id);
            this.evalOpen.set(false);
          },
          error: (err) => {
            this.evalSaving.set(false);
            this.evalError.set(message(err, 'No se pudo guardar la evaluación.'));
          },
        });

    // Si se sube checker, va primero; luego se aplica el modo.
    if (uploadingChecker) {
      this.service.setChecker(t.id, { languageId: this.checkerLang.value!, source: this.checkerText() }).subscribe({
        next: () => patch(),
        error: (err) => {
          this.evalSaving.set(false);
          this.evalError.set(message(err, 'No se pudo guardar el checker.'));
        },
      });
    } else {
      patch();
    }
  }

  // En Construir la evaluación se muestra como resumen; "Cambiar" abre el formulario
  protected readonly evalOpen = signal(false);

  toggleEval(): void {
    if (!this.evalOpen()) this.initEval();
    this.evalOpen.update((open) => !open);
  }

  evalSummary(): string {
    const t = this.testset();
    const label = this.compareLabel(this.compareMode());
    if (!t) return label;
    if (this.compareMode() === CompareMode.TOLERANCE) return `${label} (${t.floatTolerance ?? '—'})`;
    if (this.compareMode() === CompareMode.CHECKER) return `${label} · ${t.checkerId != null ? 'checker cargado' : 'sin checker'}`;
    return `${label} · ${t.timeLimitMs} ms · ${t.memoryLimitMb} MB`;
  }

  compareLabel(mode: CompareMode): string {
    return { exact: 'Exacta', tolerance: 'Con tolerancia', checker: 'Checker' }[mode] ?? mode;
  }

  constructor() {
    this.loadLanguages();

    // Al llegar el problema, abre la versión en curso (la última, si no está construida) o la vigente.
    effect(() => {
      const p = this.problem();
      if (untracked(this.selectedId) === null) this.selectedId.set(defaultTestsetId(p));
    });

    // Al entrar a un paso (y cuando llega el testset) se prepara su formulario; no en cada recarga
    effect(() => {
      const step = this.step();
      if (!this.loaded()) return;
      untracked(() => {
        this.openPanel.set(null);
        this.initStep(step);
      });
    });

    effect(() => this.affects.emit(this.affectedSteps()));

    effect(() => this.progress.emit(testsetProgress(this.problem(), this.testset())));

    // Prepara el formulario que se abre (solo cuando cambia cuál está abierto, no en cada recarga).
    effect(() => {
      const panel = this.expanded();
      untracked(() => this.initPanel(panel));
    });

    // "Agregar caso" se rearma si cambia la firma o si aparece el primer caso público.
    effect(() => {
      this.signature();
      this.noPublicCase();
      untracked(() => {
        if (!this.caseEditing()) this.resetCaseForm();
      });
    });

    // Al cambiar de versión seleccionada, carga su detalle.
    effect(() => {
      const id = this.selectedId();
      if (id) this.loadTestset(id);
    });

    // Generador: al elegir el lenguaje, el área de código se llena con su plantilla
    effect(() => {
      const lang = this.sourceLangValue();
      untracked(() => this.fillGeneratorTemplate(lang));
    });

    // Guarda el borrador del paso Solución y firma al escribir (código, lenguaje o firma)
    effect(() => {
      this.sourceText();
      this.sourceLangValue();
      this.signatureValue();
      this.detection();
      untracked(() => this.saveSolutionDraft());
    });

    // Lee la firma sola al cambiar el código, el archivo o el lenguaje (en cualquier orden)
    effect(() => {
      this.sourceText();
      this.sourceLangValue();
      untracked(() => this.scheduleDetection());
    });
    this.destroyRef.onDestroy(() => this.detectTimer && clearTimeout(this.detectTimer));

    // La firma se habilita/deshabilita según el estado del problema/testset.
    effect(() => {
      if (this.signatureEditable()) this.signatureForm.enable({ emitEvent: false });
      else this.signatureForm.disable({ emitEvent: false });
    });

    this.destroyRef.onDestroy(() => this.stopPoll());
  }

  // Los programas del staff aceptan cualquier lenguaje activo, no solo los habilitados en la edición
  private loadLanguages(): void {
    this.languagesService.catalog().subscribe({
      next: (catalog: ILanguage[]) => {
        this.languages.set(catalog.filter((l) => l.active).map((l) => ({ id: l.id, code: l.code, ext: l.file_ext, multiplier: l.time_multiplier })));
      },
      error: () => {},
    });
  }

  enabledLanguages(): EnabledLanguage[] {
    return this.languages();
  }

  languageCode(id: string | null): string {
    return this.languages().find((l) => l.id === id)?.code ?? (id ? '#' + id.slice(0, 6) : '—');
  }

  private loadProblem(): void {
    this.changed.emit();
  }

  private loadTestset(id: number): void {
    this.service.get(id).subscribe({
      next: (t) => {
        this.testset.set(t);
        this.busyKey.set(null);
        this.compareMode.set(t.compareMode);
        if (t.status === TestsetStatus.BUILDING) this.startPoll(id);
        else this.stopPoll();
      },
      error: () => this.loadError.set(true),
    });
  }

  statusTone(status: TestsetStatus): 'success' | 'warning' | 'danger' | 'neutral' {
    switch (status) {
      case TestsetStatus.READY:
        return 'success';
      case TestsetStatus.BUILDING:
        return 'warning';
      case TestsetStatus.FAILED:
        return 'danger';
      default:
        return 'neutral';
    }
  }

  originHint(origin: TestCaseOrigin): string {
    return {
      manual: 'Manual: lo escribiste tú; se puede editar',
      generated: 'Aleatorio: sale de los rangos; se reemplaza al regenerar',
      generator: 'Generador: sale de tu código al construir',
    }[origin] ?? origin;
  }

  originLabel(origin: TestCaseOrigin): string {
    return { manual: 'Manual', generated: 'Generado', generator: 'Generador' }[origin] ?? origin;
  }

  // ─── Polling del build ───
  private startPoll(id: number): void {
    this.stopPoll();
    this.pollTimer = setInterval(() => {
      this.service.get(id).subscribe({
        next: (t) => {
          this.testset.set(t);
          if (t.status !== TestsetStatus.BUILDING) {
            this.stopPoll();
            this.loadProblem(); // la versión vigente pudo cambiar
          }
        },
        error: () => this.stopPoll(),
      });
    }, 2000);
  }

  private stopPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ─── Nueva versión ───
  private readonly newVersionModal = viewChild.required<Modal>('newVersionModal');
  protected readonly reasonCtrl = this.fb.control('', [Validators.required]);
  protected readonly newVersionSaving = signal(false);

  openNewVersion(): void {
    this.reasonCtrl.reset('');
    this.newVersionModal().open();
  }

  createVersion(): void {
    if (this.reasonCtrl.invalid) {
      this.reasonCtrl.markAsTouched();
      return;
    }
    this.newVersionSaving.set(true);
    this.service.createVersion(this.problemId(), { reason: this.reasonCtrl.value! }).subscribe({
      next: (summary) => {
        this.newVersionSaving.set(false);
        this.newVersionModal().close();
        this.loadProblem();
        this.selectedId.set(summary.id);
      },
      error: (err) => {
        this.newVersionSaving.set(false);
        this.actionError.set(message(err, 'No se pudo crear la versión.'));
      },
    });
  }

  // ─── Verificar y construir: un botón corre las etapas en orden ───
  private readonly buildDialog = viewChild.required<ConfirmDialog>('buildDlg');
  protected readonly pipe = signal<{ verify: PipeStage }>({ verify: 'todo' });
  protected readonly verifyRun = signal<ITestRun | null>(null);
  private pipeSub: Subscription | null = null;

  // Con el límite real (ya multiplicado por el lenguaje de la oficial), como lo juzgaría un envío
  protected readonly refLimitMs = computed(() => {
    const t = this.testset();
    const lang = this.languages().find((l) => l.id === this.problem().refSolution?.languageId);
    return t ? Math.round(t.timeLimitMs * (lang?.multiplier ?? 1)) : 0;
  });
  // Tras verificar, el máximo medido; si ya está construida, el que guardó el build
  protected readonly refMaxMs = computed(() => {
    const run = this.verifyRun();
    if (run?.status === 'done' && run.cases.length) return Math.max(...run.cases.map((c) => c.timeMs));
    return this.built() ? (this.testset()?.refMaxTimeMs ?? null) : null;
  });
  protected readonly timeStage = computed<PipeStage>(() => {
    const max = this.refMaxMs();
    if (max === null) return 'todo';
    if (max > this.refLimitMs()) return 'error';
    return max > this.refLimitMs() / 2 ? 'warn' : 'done';
  });
  protected readonly buildStage = computed<PipeStage>(() => {
    const status = this.testset()?.status;
    if (status === TestsetStatus.BUILDING) return 'active';
    if (status === TestsetStatus.READY) return 'done';
    if (status === TestsetStatus.FAILED) return 'error';
    return 'todo';
  });
  protected readonly pipeBusy = computed(() => this.pipe().verify === 'active' || this.buildStage() === 'active');
  protected readonly pipeReadyToBuild = computed(() => this.pipe().verify === 'done' && (this.timeStage() === 'done' || this.timeStage() === 'warn'));
  // Qué está haciendo la verificación: el avance por caso solo existe cuando ya corre los casos
  private readonly verifyStartedAt = signal(0);
  private readonly verifyNow = signal(0);
  protected readonly verifyPhase = computed(() => {
    const run = this.verifyRun();
    const seconds = Math.max(0, Math.round((this.verifyNow() - this.verifyStartedAt()) / 1000));
    const elapsed = seconds ? ` · ${seconds} s` : '';
    if (!run || run.status === 'queued') return `En la cola del juez: empieza en cuanto se libere${elapsed}`;
    if (run.judged === 0) return `Compilando la solución oficial (en C# y Java tarda unos segundos)${elapsed}`;
    return `Corriendo los casos: ${run.judged} de ${run.total}${elapsed}`;
  });
  protected readonly verifyError = computed(() => {
    const run = this.verifyRun();
    if (!run || run.status === 'failed') return 'No se pudo verificar. Intenta de nuevo.';
    if (run.compileLog && !run.cases.length) return 'La solución oficial no compila. Revísala en Solución y firma.';
    const bad = run.cases.find((c) => c.verdict !== Verdict.AC);
    return bad ? `La solución oficial falló en el caso #${bad.ordinal}. Revisa el caso o la solución.` : 'La verificación no pasó.';
  });
  protected readonly buildConfirmMessage = computed(() => {
    const base = `Todo salió bien: ${this.testset()?.cases.length ?? 0} casos y la oficial tarda ${this.refMaxMs() ?? '—'} ms. Al construir se fijan las salidas esperadas y esta versión ya no se edita.`;
    return this.published() && !this.isCurrent() ? base + ' Como el problema está publicado, se re-evaluarán los envíos existentes.' : base;
  });

  runPipeline(): void {
    const t = this.testset();
    if (!t) return;
    // Ya verificado y con tiempo bien: solo falta confirmar
    if (this.pipeReadyToBuild()) {
      this.buildDialog().open();
      return;
    }
    this.actionError.set(null);
    this.pipe.set({ verify: 'active' });
    this.verifyRun.set(null);
    this.service.startTestRun(t.id, { verify: true }).subscribe({
      next: (run) => {
        // Se recuerda por si sales del paso: al volver se retoma en vez de lanzar otra
        saveDraft(this.verifyKey(t.id), { id: run.id, startedAt: Date.now() });
        this.followVerify(t.id, run.id, Date.now());
      },
      error: (err) => {
        this.pipe.set({ verify: 'error' });
        this.actionError.set(message(err, 'No se pudo verificar los casos.'));
      },
    });
  }

  private verifyKey(testsetId: number): string {
    return `verify:${testsetId}`;
  }

  // Al entrar a Construir: si había una verificación en curso de esta versión, se sigue consultando
  private resumeVerify(): void {
    const t = this.testset();
    const job = t && !this.built() ? loadDraft<{ id: string; startedAt: number }>(this.verifyKey(t.id)) : null;
    if (!t || !job) return;
    this.pipe.set({ verify: 'active' });
    this.followVerify(t.id, job.id, job.startedAt);
  }

  private followVerify(testsetId: number, runId: string, startedAt: number): void {
    this.pipeSub?.unsubscribe();
    this.verifyStartedAt.set(startedAt);
    this.verifyNow.set(Date.now());
    this.pipeSub = timer(0, 1000)
      .pipe(
        switchMap(() => this.service.getTestRun(testsetId, runId)),
        takeWhile((run) => run.status === 'queued' || run.status === 'running', true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (run) => {
          this.verifyRun.set(run);
          this.verifyNow.set(Date.now());
          if (run.status === 'queued' || run.status === 'running') return;
          clearDraft(this.verifyKey(testsetId));
          if (run.status === 'failed') {
            this.pipe.set({ verify: 'error' });
            return;
          }
          const ok = run.verdict === Verdict.AC;
          this.pipe.set({ verify: ok ? 'done' : 'error' });
          // Si el tiempo no pasa el límite real, pide confirmar y construye
          if (ok && this.timeStage() !== 'error') this.buildDialog().open();
        },
        // El resultado ya no existe (vive una hora) o se perdió la conexión: se puede volver a verificar
        error: () => {
          clearDraft(this.verifyKey(testsetId));
          this.pipe.set({ verify: 'todo' });
        },
      });
  }

  build(): void {
    const t = this.testset();
    if (!t) return;
    this.actionError.set(null);
    this.service.build(t.id).subscribe({
      next: () => this.loadTestset(t.id),
      error: (err) => this.actionError.set(message(err, 'No se pudo construir.')),
    });
  }

  // ─── Fuente: solución oficial / generador ───
  protected readonly sourceKind = signal<'ref' | 'generator'>('ref');
  protected readonly sourceLang = this.fb.control<string | null>(null, [Validators.required]);
  private readonly signatureValue = toSignal(this.signatureForm.valueChanges);
  protected readonly sourceLangValue = toSignal(this.sourceLang.valueChanges, { initialValue: this.sourceLang.value });
  protected readonly sourceText = signal('');
  protected readonly sourceFileName = signal('');
  protected readonly sourceGroups = signal<{ name: string; seeds: string }[]>([]);
  protected readonly sourceSaving = signal(false);
  protected readonly sourceError = signal<string | null>(null);

  private initSource(kind: 'ref' | 'generator'): void {
    this.sourceKind.set(kind);
    this.detectSub?.unsubscribe();
    this.detection.set(null);
    this.lastDetected = '';
    this.sourceLang.reset(null);
    this.sourceText.set('');
    this.sourceFileName.set('');
    this.sourceError.set(null);
    this.sourceGroups.set(kind === 'generator' ? [{ name: 'muestra', seeds: '1' }] : []);
  }

  onSourceFile(file: File): void {
    this.sourceFileName.set(file.name);
    // El lenguaje sale de la extensión (se puede cambiar en el select)
    const ext = file.name.split('.').pop()?.toLowerCase();
    const lang = this.languages().find((l) => l.ext === ext);
    if (lang) this.sourceLang.setValue(lang.id);
    file.text().then((text) => {
      this.sourceText.set(text);
    });
  }

  addGroup(): void {
    this.sourceGroups.update((g) => [...g, { name: '', seeds: '' }]);
  }

  removeGroup(i: number): void {
    this.sourceGroups.update((g) => g.filter((_, idx) => idx !== i));
  }

  updateGroup(i: number, field: 'name' | 'seeds', value: string): void {
    this.sourceGroups.update((g) => g.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  saveSource(): void {
    const t = this.testset();
    // Solución oficial ya guardada y sin código nuevo: "Guardar y seguir" solo avanza
    if (t && this.sourceKind() === 'ref' && !this.sourceText() && t.refSolutionId !== null) {
      this.next.emit();
      return;
    }
    if (!t || this.sourceLang.invalid || !this.sourceText()) {
      this.sourceError.set('Elige el lenguaje y sube o pega el código.');
      return;
    }
    const languageId = this.sourceLang.value!;
    const source = this.sourceText();
    this.sourceSaving.set(true);
    this.sourceError.set(null);

    const done = {
      next: () => {
        this.sourceSaving.set(false);
        this.loadTestset(t.id);
        if (this.sourceKind() === 'ref') this.next.emit();
        else this.openPanel.set(null);
      },
      error: (err: unknown) => {
        this.sourceSaving.set(false);
        this.sourceError.set(message(err, 'No se pudo guardar.'));
      },
    };

    if (this.sourceKind() === 'ref') {
      this.service.setRefSolution(t.id, { languageId, source }).subscribe(done);
    } else {
      const groups = this.sourceGroups()
        .filter((g) => g.name.trim())
        .map((g) => ({
          name: g.name.trim(),
          seeds: g.seeds
            .split(/[,\s]+/)
            .map((s) => Number(s))
            .filter((n) => Number.isFinite(n)),
        }));
      this.service.setGenerator(t.id, { languageId, source, groups }).subscribe(done);
    }
  }

  removeGenerator(): void {
    const t = this.testset();
    if (!t) return;
    this.service.removeGenerator(t.id).subscribe({
      next: () => this.loadTestset(t.id),
      error: (err) => this.actionError.set(message(err, 'No se pudo quitar el generador.')),
    });
  }

  // ─── Casos aleatorios (esquema declarativo; el backend los genera) ───
  protected readonly randGroups = signal<RandomGroup[]>([]);
  protected readonly randSaving = signal(false);
  protected readonly randErrors = signal<string[]>([]);
  protected readonly randSummary = computed(() => {
    const schema = this.testset()?.schema;
    if (!schema) return null;
    const cases = schema.groups.reduce((n, g) => n + g.seeds.length, 0);
    return `${schema.groups.length} ${schema.groups.length === 1 ? 'grupo' : 'grupos'} · ${cases} ${cases === 1 ? 'caso' : 'casos'}`;
  });

  private initRandom(): void {
    this.randErrors.set([]);
    this.randGroups.set(schemaToGroups(this.testset()?.schema ?? null, this.signature()?.params ?? []));
  }

  // El grupo nuevo copia los rangos del último: casi siempre solo cambia el tamaño.
  addRandGroup(): void {
    this.randGroups.update((groups) => {
      const last = groups.at(-1)!;
      return [...groups, { ...structuredClone(last), name: `grupo ${groups.length + 1}` }];
    });
  }

  removeRandGroup(i: number): void {
    this.randGroups.update((groups) => groups.filter((_, idx) => idx !== i));
  }

  saveRandom(): void {
    const t = this.testset();
    if (!t) return;
    const { schema, errors, total } = groupsToSchema(this.randGroups(), (this.signature()?.params ?? []).map((p) => p.name));
    const manual = t.cases.filter((c) => c.origin === TestCaseOrigin.MANUAL).length;
    if (manual + total > 500) errors.push(`Serían ${manual + total} casos en total; el máximo es 500.`);
    if (errors.length > 0) {
      this.randErrors.set(errors.slice(0, 5));
      return;
    }
    this.randErrors.set([]);
    this.randSaving.set(true);
    this.service
      .generate(t.id, { schema })
      .subscribe({
        next: () => {
          this.randSaving.set(false);
          this.openPanel.set(null);
          this.loadTestset(t.id);
        },
        error: (err) => {
          this.randSaving.set(false);
          this.randErrors.set([message(err, 'No se pudieron generar los casos aleatorios. Revisa los rangos.')]);
          this.loadTestset(t.id);
        },
      });
  }

  removeRandom(): void {
    const t = this.testset();
    if (!t) return;
    this.service.update(t.id, { schema: null }).subscribe({
      next: () => this.loadTestset(t.id),
      error: (err) => this.actionError.set(message(err, 'No se pudieron quitar los casos aleatorios.')),
    });
  }

  // ─── Casos ───
  protected readonly caseEditing = signal<ITestCase | null>(null);
  protected readonly caseVisibility = signal<TestCaseVisibility>(TestCaseVisibility.HIDDEN);
  // Se conserva entre casos: así se agregan varios seguidos al mismo grupo (p. ej. "bordes")
  protected readonly caseGroup = signal('');
  protected readonly groupNames = computed(() => this.caseGroups().flatMap((g) => (g.key ? [g.key] : [])));
  protected readonly caseParams = signal<{ param: ISignatureParam; isArray: boolean }[]>([]);
  protected readonly caseForm = signal<FormGroup>(this.fb.group({}));
  protected readonly caseSaving = signal(false);
  protected readonly caseError = signal<string | null>(null);
  // Error por campo (JSON inválido, número inválido), debajo del campo correspondiente.
  protected readonly caseFieldErrors = signal<Record<string, string>>({});
  private readonly deleteCaseDialog = viewChild.required<ConfirmDialog>('deleteCaseDlg');
  private pendingDeleteCase: ITestCase | null = null;

  private buildCaseControls(): void {
    const sig = this.signature();
    const params = (sig?.params ?? []).map((param) => ({ param, isArray: param.type.type === 'array' }));
    this.caseParams.set(params);
    const group = this.fb.group({});
    for (const { param } of params) {
      group.addControl(param.name, this.fb.control(''));
    }
    this.caseForm.set(group);
  }

  // Deja el formulario listo para agregar otro caso. El primero sale público: se necesita uno de ejemplo.
  resetCaseForm(): void {
    this.caseEditing.set(null);
    this.caseVisibility.set(this.noPublicCase() ? TestCaseVisibility.PUBLIC : TestCaseVisibility.HIDDEN);
    this.caseError.set(null);
    this.caseFieldErrors.set({});
    this.buildCaseControls();
  }

  // "Editar" carga el caso en el formulario de abajo: lo llevamos a la vista y lo marcamos
  private readonly caseFormEl = viewChild<ElementRef<HTMLFormElement>>('caseFormEl');

  private revealCaseForm(): void {
    const form = this.caseFormEl()?.nativeElement;
    if (!form) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    form.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    // Reinicia el destello aunque se pulse "Editar" en otra fila mientras corre
    form.classList.remove('tw__panel--flash');
    void form.offsetWidth;
    form.classList.add('tw__panel--flash');
    form.querySelector<HTMLElement>('input, textarea, select')?.focus({ preventScroll: true });
  }

  openEditCase(c: ITestCase): void {
    this.caseEditing.set(c);
    this.caseVisibility.set(c.visibility);
    this.caseGroup.set(c.group ?? '');
    this.caseError.set(null);
    this.caseFieldErrors.set({});
    this.buildCaseControls();
    const t = this.testset();
    // El input solo se puede editar en casos manuales; cargamos sus valores actuales.
    if (t && c.origin === TestCaseOrigin.MANUAL) {
      this.service.getCase(t.id, c.id).subscribe({
        next: (content) => {
          try {
            const input = JSON.parse(content.input) as Record<string, unknown>;
            for (const { param } of this.caseParams()) {
              const raw = input[param.name];
              this.caseForm().get(param.name)?.setValue(typeof raw === 'object' ? JSON.stringify(raw) : String(raw));
            }
          } catch {
            /* se deja vacío */
          }
        },
        error: () => {},
      });
    }
    this.revealCaseForm();
  }

  protected readonly caseInputEditable = computed(
    () => this.caseEditing() === null || this.caseEditing()!.origin === TestCaseOrigin.MANUAL,
  );

  controlType(param: ISignatureParam): 'number' | 'long' | 'bool' | 'string' | 'json' {
    if (param.type.type === 'array') return 'json';
    const base = scalarBase(param.type);
    if (base === 'int' || base === 'float') return 'number';
    if (base === 'long') return 'long';
    if (base === 'bool') return 'bool';
    return 'string';
  }

  typeLabel(param: ISignatureParam): string {
    return typeToString(param.type);
  }

  // Placeholder de ejemplo según el tipo del parámetro.
  placeholder(param: ISignatureParam): string {
    const kind = this.controlType(param);
    if (kind === 'json') return 'Ej. ' + this.jsonExample(param);
    if (kind === 'string') return 'Ej. texto';
    return 'Ej. 5';
  }

  saveCase(): void {
    const t = this.testset();
    if (!t) return;
    const editing = this.caseEditing();

    // Solo visibilidad para casos no manuales.
    if (editing && editing.origin !== TestCaseOrigin.MANUAL) {
      this.caseSaving.set(true);
      this.service.updateCase(t.id, editing.id, { visibility: this.caseVisibility() }).subscribe({
        next: () => this.afterCaseSaved(t.id),
        error: (err) => this.caseFailed(err),
      });
      return;
    }

    // Arma el input por parámetro según su tipo; los errores van debajo de cada campo.
    const input: Record<string, unknown> = {};
    const fieldErrors: Record<string, string> = {};
    for (const { param } of this.caseParams()) {
      try {
        input[param.name] = this.parseParam(param, String(this.caseForm().get(param.name)?.value ?? ''));
      } catch (e) {
        fieldErrors[param.name] = (e as Error).message;
      }
    }
    this.caseFieldErrors.set(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      this.caseError.set('Revisa los campos marcados.');
      return;
    }

    this.caseSaving.set(true);
    this.caseError.set(null);
    const group = this.caseGroup().trim() || null;
    const req = editing
      ? this.service.updateCase(t.id, editing.id, { input, visibility: this.caseVisibility(), group })
      : this.service.addCase(t.id, { input, visibility: this.caseVisibility(), group });
    req.subscribe({ next: () => this.afterCaseSaved(t.id), error: (err) => this.caseFailed(err) });
  }

  private parseParam(param: ISignatureParam, raw: string): unknown {
    const kind = this.controlType(param);
    const text = raw.trim();
    if (kind === 'json') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`No es un JSON válido (p. ej. ${this.jsonExample(param)}).`);
      }
      if (!Array.isArray(parsed)) throw new Error(`Debe ser un arreglo JSON, p. ej. ${this.jsonExample(param)}.`);
      return parsed;
    }
    if (kind === 'bool') return text === 'true';
    if (kind === 'string') return raw;
    if (kind === 'long') {
      // Enteros grandes como string; el backend acepta número o string.
      if (!/^-?\d+$/.test(text) && !Number.isFinite(Number(text))) throw new Error('Número entero inválido.');
      return /^-?\d+$/.test(text) ? text : Number(text);
    }
    const n = Number(text);
    if (text === '' || !Number.isFinite(n)) throw new Error('Número inválido.');
    return n;
  }

  // Ejemplo de JSON según el tipo del parámetro, para el mensaje de error.
  private jsonExample(param: ISignatureParam): string {
    return typeToString(param.type).includes('[][]') ? '[[1, 2], [3]]' : '[1, 2, 3]';
  }

  // Valida un campo al salir de él (deja el error debajo).
  validateCaseField(param: ISignatureParam): void {
    const errs = { ...this.caseFieldErrors() };
    try {
      this.parseParam(param, String(this.caseForm().get(param.name)?.value ?? ''));
      delete errs[param.name];
    } catch (e) {
      errs[param.name] = (e as Error).message;
    }
    this.caseFieldErrors.set(errs);
  }

  fieldError(name: string): string | undefined {
    return this.caseFieldErrors()[name];
  }

  // ─── Ver caso (solo lectura) ───
  private readonly viewModal = viewChild.required<Modal>('viewModal');
  protected readonly viewCase = signal<ITestCase | null>(null);
  protected readonly viewParams = signal<{ name: string; value: string }[]>([]);
  protected readonly viewOutput = signal<string | null>(null);
  protected readonly viewLoading = signal(false);

  openView(c: ITestCase): void {
    const t = this.testset();
    if (!t) return;
    this.viewCase.set(c);
    this.viewParams.set([]);
    this.viewOutput.set(null);
    this.viewLoading.set(true);
    this.viewModal().open();
    this.service.getCase(t.id, c.id).subscribe({
      next: (content) => {
        this.viewLoading.set(false);
        this.viewOutput.set(content.output);
        try {
          const input = JSON.parse(content.input) as Record<string, unknown>;
          this.viewParams.set(Object.entries(input).map(([name, value]) => ({ name, value: JSON.stringify(value) })));
        } catch {
          this.viewParams.set([]);
        }
      },
      error: (err) => {
        this.viewLoading.set(false);
        this.actionError.set(message(err, 'No se pudo cargar el caso.'));
        this.viewModal().close();
      },
    });
  }

  private afterCaseSaved(testsetId: number): void {
    this.caseSaving.set(false);
    this.loadTestset(testsetId);
    this.resetCaseForm();
  }

  private caseFailed(err: unknown): void {
    this.caseSaving.set(false);
    this.caseError.set(message(err, 'No se pudo guardar el caso.'));
  }

  toggleVisibility(c: ITestCase): void {
    const t = this.testset();
    if (!t) return;
    const visibility = c.visibility === TestCaseVisibility.PUBLIC ? TestCaseVisibility.HIDDEN : TestCaseVisibility.PUBLIC;
    this.busyKey.set('vis:' + c.id);
    this.service.updateCase(t.id, c.id, { visibility }).subscribe({
      next: () => this.loadTestset(t.id),
      error: (err) => this.actionFailed(err, 'No se pudo cambiar la visibilidad del caso.'),
    });
  }

  setGroupVisibility(group: string | null, visibility: TestCaseVisibility): void {
    const t = this.testset();
    if (!t) return;
    this.busyKey.set('group:' + (group ?? '') + ':' + visibility);
    this.service.updateCasesVisibility(t.id, { group, visibility }).subscribe({
      next: () => this.loadTestset(t.id),
      error: (err) => this.actionFailed(err, 'No se pudo cambiar la visibilidad del grupo.'),
    });
  }

  askDeleteCase(c: ITestCase): void {
    this.pendingDeleteCase = c;
    this.deleteCaseDialog().open();
  }

  removeCase(): void {
    const t = this.testset();
    const c = this.pendingDeleteCase;
    if (!t || !c) return;
    this.service.removeCase(t.id, c.id).subscribe({
      next: () => this.loadTestset(t.id),
      error: (err) => this.actionError.set(message(err, 'No se pudo eliminar el caso.')),
    });
  }

  closeModal(m: 'newVersion' | 'view'): void {
    if (m === 'newVersion') this.newVersionModal().close();
    else this.viewModal().close();
  }

  // Resumen de los parámetros de un caso (del inputPreview JSON) en una línea: "a = 2, b = 3".
  caseSummary(c: ITestCase): string {
    if (!c.inputPreview) return '—';
    try {
      const input = JSON.parse(c.inputPreview) as Record<string, unknown>;
      const parts = Object.entries(input).map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
      return parts.length ? parts.join(', ') : '—';
    } catch {
      return c.inputPreview;
    }
  }

  protected readonly TestsetStatus = TestsetStatus;
  protected readonly TestCaseVisibility = TestCaseVisibility;
  protected readonly CompareMode = CompareMode;
  protected readonly TestCaseOrigin = TestCaseOrigin;
}

function message(err: unknown, fallback: string): string {
  return backendMessage(err, fallback);
}
