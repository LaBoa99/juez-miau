import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'oj-file-drop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label
      class="oj-fd"
      [class.oj-fd--dragging]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <input
        type="file"
        class="oj-visually-hidden"
        [accept]="accept()"
        (change)="onChange($event)"
      />
      @if (file(); as f) {
        <span class="oj-fd__file">{{ f.name }} · {{ (f.size / 1024).toFixed(1) }} KB</span>
      } @else {
        <span class="oj-fd__hint">Arrastra un archivo aquí o haz clic para elegir</span>
      }
    </label>
  `,
  styles: `
    .oj-fd {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      border: 1px dashed var(--oj-border);
      border-radius: var(--oj-radius);
      cursor: pointer;
      text-align: center;
    }
    .oj-fd--dragging {
      border-color: var(--oj-text);
    }
    .oj-fd__hint {
      font-size: 13px;
      color: var(--oj-text-muted);
    }
    .oj-fd__file {
      font-family: var(--oj-font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 13px;
      color: var(--oj-text);
    }
  `,
})
export class FileDrop {
  readonly accept = input('.csv');
  readonly fileSelected = output<File>();

  protected readonly file = signal<File | undefined>(undefined);
  protected readonly dragging = signal(false);

  protected onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    this.pick(event.dataTransfer?.files?.[0]);
  }

  protected onChange(event: Event) {
    this.pick((event.target as HTMLInputElement).files?.[0]);
  }

  private pick(file: File | undefined) {
    if (!file) return;
    this.file.set(file);
    this.fileSelected.emit(file);
  }
}
