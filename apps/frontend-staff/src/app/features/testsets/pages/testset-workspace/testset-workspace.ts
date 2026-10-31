import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CompareMode,
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

// Identificador válido (igual que el backend): letras, dígitos y _, hasta 64, sin empezar por dígito.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

interface EnabledLanguage {
  id: string;
  code: string;
}

type StepKey = 'firma' | 'solucion' | 'evaluacion' | 'casos' | 'construir';
type StepState = 'done' | 'next' | 'pending';

interface Step {
  key: StepKey;
  n: number;
  title: string;
  actionLabel: string;
  done: boolean;
  state: StepState;
  hint: string;
}

@Component({
  selector: 'oj-testset-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
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
  private readonly route = inject(ActivatedRoute);
  private readonly problemsService = inject(ProblemsService);
  private readonly languagesService = inject(EditionLanguagesService);
  private readonly service = inject(TestsetsService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editionId = Number(findParam(this.route, 'id'));
  protected readonly problemId = Number(findParam(this.route, 'problemId'));

  protected readonly problem = signal<IProblemDetail | null>(null);
  protected readonly testset = signal<ITestsetDetail | null>(null);
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
    return s === TestsetStatus.DRAFT || s === TestsetStatus.FAILED;
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

  // La firma debe tener parámetros para poder armar un caso.
  protected readonly hasParams = computed(() => (this.signature()?.params.length ?? 0) > 0);

  // ─── Modo de evaluación vigente (del testset), para los pasos y el resumen ───
  protected readonly compareMode = signal<CompareMode>(CompareMode.EXACT);

  // ─── Completado de cada paso (lo mismo que valida el backend al construir) ───
  private readonly firmaDone = computed(() => this.hasParams());
  private readonly solucionDone = computed(() => this.testset()?.refSolutionId != null);
  private readonly evalDone = computed(() => {
    const t = this.testset();
    if (this.compareMode() === CompareMode.CHECKER) return t?.checkerId != null;
    if (this.compareMode() === CompareMode.TOLERANCE) {
      const tol = t?.floatTolerance ?? null;
      return tol != null && tol > 0 && tol <= 1;
    }
    return true; // exacta siempre está configurada (es el valor por defecto)
  });
  private readonly casosDone = computed(() => {
    const cases = this.testset()?.cases ?? [];
    return cases.length > 0 && cases.some((c) => c.visibility === TestCaseVisibility.PUBLIC);
  });
  private readonly construirDone = computed(() => this.testset()?.status === TestsetStatus.READY);

  // Los 5 pasos en orden; el primer pendiente es el "siguiente", el resto quedan en gris.
  protected readonly steps = computed<Step[]>(() => {
    const t = this.testset();
    const done = [this.firmaDone(), this.solucionDone(), this.evalDone(), this.casosDone(), this.construirDone()];
    const firstPending = done.findIndex((d) => !d);
    const defs: Omit<Step, 'n' | 'done' | 'state'>[] = [
      { key: 'firma', title: 'Firma', actionLabel: 'Editar', hint: 'Define la firma de la función (con al menos un parámetro).' },
      { key: 'solucion', title: 'Solución oficial', actionLabel: t?.refSolutionId != null ? 'Reemplazar' : 'Subir', hint: 'Sube la solución oficial que calculará las salidas.' },
      { key: 'evaluacion', title: 'Evaluación', actionLabel: 'Cambiar', hint: 'Elige cómo se comparan las salidas.' },
      { key: 'casos', title: 'Casos de prueba', actionLabel: '+ Agregar caso', hint: 'Agrega al menos un caso, con uno público.' },
      { key: 'construir', title: 'Construir', actionLabel: 'Construir', hint: 'Construye el testset para calcular las salidas esperadas.' },
    ];
    return defs.map((d, i) => ({
      ...d,
      n: i + 1,
      done: done[i],
      state: done[i] ? 'done' : i === firstPending ? 'next' : 'pending',
    }));
  });
  protected readonly progressDone = computed(() => this.steps().filter((s) => s.done).length);
  protected readonly nextStep = computed(() => this.steps().find((s) => s.state === 'next') ?? null);
  // Construir exige los 4 pasos previos completos.
  protected readonly canBuild = computed(
    () => this.firmaDone() && this.solucionDone() && this.evalDone() && this.casosDone(),
  );

  // Un paso (de los 4 primeros) se puede accionar si el testset es editable y ya es el actual o uno hecho.
  stepEnabled(state: StepState): boolean {
    return this.editable() && state !== 'pending';
  }

  // ─── Firma (modal) ───
  protected readonly scalarTypes = SCALAR_TYPES;
  protected readonly depths = Array.from({ length: MAX_ARRAY_DEPTH + 1 }, (_, i) => i);
  private readonly signatureModal = viewChild.required<Modal>('signatureModal');
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

  openSignature(): void {
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
    }
    this.signatureModal().open();
  }

  addParam(): void {
    this.sigParams.push(this.paramGroup());
  }

  removeParam(i: number): void {
    this.sigParams.removeAt(i);
  }

  saveSignature(): void {
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
    this.problemsService.updateSignature(this.problemId, sig).subscribe({
      next: () => {
        this.signatureSaving.set(false);
        this.signatureModal().close();
        this.loadProblem();
      },
      error: (err) => {
        this.signatureSaving.set(false);
        this.signatureError.set(message(err, 'No se pudo guardar la firma.'));
      },
    });
  }

  // ─── Evaluación (modal) ───
  // Tarjetas con título y "cuándo usarla"; la seleccionada muestra sus campos.
  protected readonly evalCards = [
    { mode: CompareMode.EXACT, title: 'Exacta', when: 'La salida debe coincidir carácter por carácter.' },
    { mode: CompareMode.TOLERANCE, title: 'Con tolerancia', when: 'Para resultados con decimales; acepta una diferencia pequeña.' },
    { mode: CompareMode.CHECKER, title: 'Checker', when: 'Cuando hay varias respuestas válidas; un programa decide.' },
  ];
  private readonly evalModal = viewChild.required<Modal>('evalModal');
  protected readonly evalMode = signal<CompareMode>(CompareMode.EXACT);
  protected readonly evalSaving = signal(false);
  protected readonly evalError = signal<string | null>(null);
  protected readonly evalForm = this.fb.group({
    timeLimitMs: [1000, [Validators.required]],
    memoryLimitMb: [256, [Validators.required]],
    floatTolerance: [null as number | null],
  });
  // Checker: se sube dentro del modal de evaluación (solo con la tarjeta "Checker").
  protected readonly checkerLang = this.fb.control<string | null>(null);
  protected readonly checkerText = signal('');
  protected readonly checkerFileName = signal('');

  openEval(): void {
    const t = this.testset();
    if (!t) return;
    this.evalError.set(null);
    this.evalMode.set(t.compareMode);
    this.evalForm.reset({ timeLimitMs: t.timeLimitMs, memoryLimitMb: t.memoryLimitMb, floatTolerance: t.floatTolerance });
    this.checkerLang.reset(null);
    this.checkerText.set('');
    this.checkerFileName.set('');
    this.evalModal().open();
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

    // Checker: hace falta uno (el ya guardado o el que se sube ahora).
    const uploadingChecker = mode === CompareMode.CHECKER && !!this.checkerText();
    if (mode === CompareMode.CHECKER && t.checkerId == null && !uploadingChecker) {
      this.evalError.set('Sube el programa checker (elige el lenguaje y el archivo).');
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
            this.evalModal().close();
            this.loadTestset(t.id);
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
    this.loadLanguages();
    this.loadProblem();

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

  private loadLanguages(): void {
    // La solución oficial / generador / checker los escribe el juez: se eligen del catálogo
    // global (languageId = UUID del catálogo), no de los lenguajes habilitados para los equipos.
    this.languagesService.catalog().subscribe({
      next: (catalog: ILanguage[]) =>
        this.languages.set(catalog.filter((l) => l.active).map((l) => ({ id: l.id, code: l.code }))),
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
    this.problemsService.get(this.problemId).subscribe({
      next: (p) => {
        this.problem.set(p);
        if (this.selectedId() === null) {
          const fallback = p.currentTestsetId ?? p.testsets.at(-1)?.id ?? null;
          this.selectedId.set(fallback);
        }
      },
      error: () => this.loadError.set(true),
    });
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

  // ─── Acción del paso ───
  stepAction(key: StepKey): void {
    if (key === 'firma') this.openSignature();
    else if (key === 'solucion') this.openSource('ref');
    else if (key === 'evaluacion') this.openEval();
    else if (key === 'casos') this.openAddCase();
    else if (key === 'construir') this.askBuild();
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
    this.service.createVersion(this.problemId, { reason: this.reasonCtrl.value! }).subscribe({
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
  private readonly sourceModal = viewChild.required<Modal>('sourceModal');
  protected readonly sourceKind = signal<'ref' | 'generator'>('ref');
  protected readonly sourceLang = this.fb.control<string | null>(null, [Validators.required]);
  protected readonly sourceText = signal('');
  protected readonly sourceFileName = signal('');
  protected readonly sourceGroups = signal<{ name: string; seeds: string }[]>([]);
  protected readonly sourceSaving = signal(false);
  protected readonly sourceError = signal<string | null>(null);

  openSource(kind: 'ref' | 'generator'): void {
    this.sourceKind.set(kind);
    this.sourceLang.reset(null);
    this.sourceText.set('');
    this.sourceFileName.set('');
    this.sourceError.set(null);
    this.sourceGroups.set(kind === 'generator' ? [{ name: 'muestra', seeds: '1' }] : []);
    this.sourceModal().open();
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
    if (!t || this.sourceLang.invalid || !this.sourceText()) {
      this.sourceError.set('Elige el lenguaje y el archivo de código.');
      return;
    }
    const languageId = this.sourceLang.value!;
    const source = this.sourceText();
    this.sourceSaving.set(true);
    this.sourceError.set(null);

    const done = {
      next: () => {
        this.sourceSaving.set(false);
        this.sourceModal().close();
        this.loadTestset(t.id);
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

  // ─── Casos ───
  private readonly caseModal = viewChild.required<Modal>('caseModal');
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

  openAddCase(): void {
    this.caseEditing.set(null);
    this.caseVisibility.set(TestCaseVisibility.HIDDEN);
    this.caseError.set(null);
    this.caseFieldErrors.set({});
    this.buildCaseControls();
    this.caseModal().open();
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
    this.caseModal().open();
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
    this.caseModal().close();
    this.loadTestset(testsetId);
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

  closeModal(m: 'newVersion' | 'source' | 'case' | 'view' | 'signature' | 'eval'): void {
    if (m === 'newVersion') this.newVersionModal().close();
    else if (m === 'source') this.sourceModal().close();
    else if (m === 'view') this.viewModal().close();
    else if (m === 'signature') this.signatureModal().close();
    else if (m === 'eval') this.evalModal().close();
    else this.caseModal().close();
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

function findParam(route: ActivatedRoute, name: string): string | null {
  return route.pathFromRoot.map((r) => r.snapshot.paramMap.get(name)).find((v) => v != null) ?? null;
}

function message(err: unknown, fallback: string): string {
  return backendMessage(err, fallback);
}
