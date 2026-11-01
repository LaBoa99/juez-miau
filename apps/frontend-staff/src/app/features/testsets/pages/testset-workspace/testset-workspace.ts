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
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CompareMode,
  IEditionLanguage,
  ILanguage,
  IProblemDetail,
  IProblemSignature,
  ISignatureParam,
  ITestCase,
  ITestsetDetail,
  ProblemStatus,
  ScalarType,
  TestCaseOrigin,
  TestCaseVisibility,
  TestsetStatus,
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
import { forkJoin, switchMap } from 'rxjs';
import { TestRunModal } from '../test-run-modal/test-run-modal';

// Identificador válido (igual que el backend): letras, dígitos y _, hasta 64, sin empezar por dígito.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

interface EnabledLanguage {
  id: string;
  code: string;
}

// Pasos de los casos de prueba; la página del problema muestra uno a la vez.
export type TestsetStep = 'firma' | 'solucion' | 'evaluacion' | 'casos' | 'construir';
export type TestsetProgress = Record<TestsetStep, boolean>;

// Versión que se abre al entrar: la última si no está construida, si no la vigente.
export function defaultTestsetId(p: IProblemDetail): number | null {
  const last = p.testsets.at(-1);
  const inProgress = last && last.status !== TestsetStatus.READY ? last.id : null;
  return inProgress ?? p.currentTestsetId ?? last?.id ?? null;
}

// Completado de cada paso (lo mismo que valida el backend al construir).
export function testsetProgress(p: IProblemDetail, t: ITestsetDetail | null): TestsetProgress {
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
type PanelKey = 'generador' | 'aleatorios';

const STEP_TEXT: Record<TestsetStep, { title: string; hint: string }> = {
  firma: { title: 'Firma', hint: 'La función que implementa el concursante: nombre, parámetros con su tipo y tipo de retorno.' },
  solucion: { title: 'Solución oficial', hint: 'Elige el lenguaje y sube el archivo. Con ella se calculan las salidas esperadas de cada caso.' },
  evaluacion: { title: 'Evaluación', hint: 'Cómo se comparan las salidas y los límites de tiempo y memoria. Exacta funciona para casi todo.' },
  casos: { title: 'Casos de prueba', hint: 'Al menos un caso público (sale como ejemplo en el enunciado). Agrega manuales, aleatorios por rangos o con un generador.' },
  construir: { title: 'Construir y publicar', hint: 'Construir ejecuta la solución oficial en cada caso para obtener las salidas esperadas.' },
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
  ],
  templateUrl: './testset-workspace.html',
  styleUrls: ['./testset-workspace.css', './testset-workspace.boxes.css'],
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
  private readonly editionId = computed(() => this.problem().editionId);

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
  protected readonly editable = computed(() => {
    const s = this.testset()?.status;
    return !this.readOnly() && (s === TestsetStatus.DRAFT || s === TestsetStatus.FAILED);
  });
  // La firma solo cambia con el problema sin publicar y su testset editable (DRAFT/FAILED).
  protected readonly signatureEditable = computed(() => !this.published() && this.editable());

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

  protected readonly noPublicCase = computed(() => this.caseStats().pub === 0);

  // La firma debe tener parámetros para poder armar un caso.
  protected readonly hasParams = computed(() => (this.signature()?.params.length ?? 0) > 0);

  // ─── Modo de evaluación vigente (del testset), para los pasos y el resumen ───
  protected readonly compareMode = signal<CompareMode>(CompareMode.EXACT);

  private readonly done = computed(() => testsetProgress(this.problem(), this.testset()));

  // Construir exige los 4 pasos previos completos.
  protected readonly canBuild = computed(() => {
    const d = this.done();
    return this.editable() && d.firma && d.solucion && d.evaluacion && d.casos;
  });
  protected readonly built = computed(() => this.testset()?.status === TestsetStatus.READY);
  // Verificar: hace falta la solución oficial y algún caso; no tiene sentido ya construido
  protected readonly canVerify = computed(() => {
    const t = this.testset();
    return !!t && !this.built() && t.status !== TestsetStatus.BUILDING && t.refSolutionId !== null && t.cases.length > 0;
  });

  protected readonly generating = signal(false);
  protected readonly genMessage = signal<string | null>(null);

  // Vuelve a generar los casos aleatorios con el esquema guardado
  regenerate(): void {
    const t = this.testset();
    if (!t) return;
    this.generating.set(true);
    this.genMessage.set(null);
    this.service.generate(t.id).subscribe({
      next: (res) => {
        this.generating.set(false);
        this.genMessage.set(`Se generaron ${res.generatedCount} casos aleatorios.`);
        this.loadTestset(t.id);
      },
      error: (err) => {
        this.generating.set(false);
        this.actionError.set(message(err, 'No se pudieron generar los casos aleatorios.'));
      },
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
      case 'firma':
        if (!this.signatureEditable() || !this.signature() || (!hasCases && t.refSolutionId === null)) return null;
        return 'La solución oficial y el generador deben usar el nuevo nombre y parámetros, y los casos y rangos aleatorios deben seguir siendo válidos con la nueva firma (si no, no se guarda).';
      case 'solucion':
        return t.refSolutionId !== null && hasCases
          ? 'Reemplazar la solución oficial cambia las salidas esperadas de todos los casos; se recalculan al construir.'
          : null;
      case 'evaluacion':
        return hasCases ? 'Los límites y la forma de comparar cambian cómo se juzgan todos los casos y los envíos.' : null;
      default:
        return null;
    }
  });

  protected readonly affectedSteps = computed<TestsetStep[]>(() => {
    if (!this.warning()) return [];
    switch (this.step()) {
      case 'firma':
        return ['solucion', 'casos', 'construir'];
      case 'solucion':
      case 'evaluacion':
        return ['construir'];
      default:
        return [];
    }
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
  }

  // El formulario del paso visible ya está abierto: se prepara al entrar al paso.
  private initStep(step: TestsetStep): void {
    if (step === 'firma') this.initSignature();
    else if (step === 'solucion') this.initSource('ref');
    else if (step === 'evaluacion') this.initEval();
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

  saveSignature(): void {
    // Sin cambios en una firma que ya existe: solo avanza
    if (this.signature() && this.signatureForm.pristine) {
      this.next.emit();
      return;
    }
    if (this.signatureForm.invalid) {
      this.signatureForm.markAllAsTouched();
      this.signatureError.set(
        'Revisa la firma: el nombre de la función y de cada parámetro son obligatorios y deben ser identificadores válidos (letras, dígitos y _).',
      );
      return;
    }
    const raw = this.signatureForm.getRawValue();
    const paramRows = raw.params as { name: string; base: ScalarType; depth: number }[];

    // Sin parámetros no se pueden armar casos de prueba: no guardamos.
    if (paramRows.length === 0) {
      this.signatureError.set('Agrega al menos un parámetro para poder crear casos de prueba.');
      return;
    }

    // Nombres de parámetro únicos (el backend también lo valida, pero avisamos antes de enviar).
    const names = paramRows.map((p) => p.name);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) {
      this.signatureError.set(`El parámetro "${dup}" está repetido. Usa nombres únicos.`);
      return;
    }

    const sig: IProblemSignature = {
      functionName: raw.functionName!,
      params: paramRows.map((p) => ({ name: p.name, type: uiToType(p.base, p.depth) })),
      returns: uiToType(raw.returnBase as ScalarType, raw.returnDepth as number),
    };
    this.signatureSaving.set(true);
    this.signatureError.set(null);
    this.problemsService.updateSignature(this.problemId(), sig).subscribe({
      next: () => {
        this.signatureSaving.set(false);
        this.loadProblem();
        this.next.emit();
      },
      error: (err) => {
        this.signatureSaving.set(false);
        this.signatureError.set(message(err, 'No se pudo guardar la firma.'));
      },
    });
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
      this.evalError.set('El checker necesita la firma: defínela primero (paso Firma) y vuelve a elegir Checker.');
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
            this.next.emit();
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
    // Los lenguajes dependen de la edición del problema (se cargan una vez)
    effect(() => {
      const editionId = this.editionId();
      untracked(() => this.loadLanguages(editionId));
    });

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

    effect(() => this.progress.emit(this.done()));

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

    // La firma se habilita/deshabilita según el estado del problema/testset.
    effect(() => {
      if (this.signatureEditable()) this.signatureForm.enable({ emitEvent: false });
      else this.signatureForm.disable({ emitEvent: false });
    });

    this.destroyRef.onDestroy(() => this.stopPoll());
  }

  // El backend solo acepta lenguajes activos y habilitados en la edición. La lista de la edición
  // trae el código, no el id, así que se cruza con el catálogo.
  private loadLanguages(editionId: number): void {
    forkJoin([this.languagesService.catalog(), this.languagesService.ofEdition(editionId)]).subscribe({
      next: ([catalog, enabled]: [ILanguage[], IEditionLanguage[]]) => {
        const codes = new Set(enabled.filter((l) => l.active).map((l) => l.code));
        this.languages.set(catalog.filter((l) => l.active && codes.has(l.code)).map((l) => ({ id: l.id, code: l.code })));
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

  // ─── Construir ───
  private readonly buildDialog = viewChild.required<ConfirmDialog>('buildDlg');

  askBuild(): void {
    // Construir una versión distinta de la vigente en un problema publicado re-evalúa los envíos.
    if (this.published() && !this.isCurrent()) this.buildDialog().open();
    else this.build();
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
  protected readonly sourceText = signal('');
  protected readonly sourceFileName = signal('');
  protected readonly sourceGroups = signal<{ name: string; seeds: string }[]>([]);
  protected readonly sourceSaving = signal(false);
  protected readonly sourceError = signal<string | null>(null);

  private initSource(kind: 'ref' | 'generator'): void {
    this.sourceKind.set(kind);
    this.sourceLang.reset(null);
    this.sourceText.set('');
    this.sourceFileName.set('');
    this.sourceError.set(null);
    this.sourceGroups.set(kind === 'generator' ? [{ name: 'muestra', seeds: '1' }] : []);
  }

  onSourceFile(file: File): void {
    this.sourceFileName.set(file.name);
    file.text().then((text) => this.sourceText.set(text));
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
      .update(t.id, { schema })
      .pipe(switchMap(() => this.service.generate(t.id)))
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
    const req = editing
      ? this.service.updateCase(t.id, editing.id, { input, visibility: this.caseVisibility() })
      : this.service.addCase(t.id, { input, visibility: this.caseVisibility() });
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
