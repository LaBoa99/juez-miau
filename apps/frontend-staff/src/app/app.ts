import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/notifications/toast.service';
import { ToastStack } from './shared/ui/toast-stack.component';

@Component({
  imports: [RouterOutlet, ToastStack],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend-staff');
  protected readonly toast = inject(ToastService);
}
