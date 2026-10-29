import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { EditionContext } from './edition-context';

@Component({
  selector: 'oj-edition-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  providers: [EditionContext],
  templateUrl: './edition-layout.html',
  styleUrl: './edition-layout.css',
})
export class EditionLayout {
  private readonly route = inject(ActivatedRoute);
  protected readonly ctx = inject(EditionContext);

  protected readonly id = Number(this.route.snapshot.paramMap.get('id'));
  // El backend no tiene "código" de edición: se muestra el nombre.
  protected readonly code = computed(() => this.ctx.edition()?.name ?? '');

  protected readonly sections = [
    { label: 'Configuración', path: 'configuracion' },
    { label: 'Equipos', path: 'equipos' },
    { label: 'Problemas', path: 'problemas' },
    { label: 'Concurso', path: 'concurso' },
    { label: 'Envíos', path: 'envios' },
    { label: 'Marcador', path: 'marcador' },
    { label: 'Revisión', path: 'revision' },
    { label: 'Alertas', path: 'alertas' },
  ];

  constructor() {
    this.ctx.load(this.id);
  }
}
