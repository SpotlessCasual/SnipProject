import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { Link, LinksService } from './links.service';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly linksService = inject(LinksService);

  readonly form = this.formBuilder.group({
    url: this.formBuilder.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(2048),
      httpUrlValidator
    ])
  });
  readonly urlControl = this.form.controls.url;
  readonly links = signal<Link[]>([]);
  readonly createdLink = signal<Link | null>(null);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly listError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadLinks();
  }

  createLink(): void {
    if (this.isSubmitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.createdLink.set(null);

    this.linksService.createLink(this.urlControl.value.trim()).pipe(
      finalize(() => this.isSubmitting.set(false))
    ).subscribe({
      next: (link) => {
        this.createdLink.set(link);
        this.form.reset();
        this.loadLinks();
      },
      error: (error: unknown) => {
        this.submitError.set(getErrorMessage(error, 'Could not shorten this URL. Please try again.'));
      }
    });
  }

  loadLinks(): void {
    this.isLoading.set(true);
    this.listError.set(null);

    this.linksService.getLinks().pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: (links) => this.links.set(links),
      error: (error: unknown) => {
        this.listError.set(getErrorMessage(error, 'Could not load your links.'));
      }
    });
  }
}

function httpUrlValidator(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (
      typeof error.error === 'object' &&
      error.error !== null &&
      'error' in error.error &&
      typeof error.error.error === 'string'
    ) {
      return error.error.error;
    }
    return error.status === 0
      ? 'Could not reach the Snip API. Check that the backend is running.'
      : fallback;
  }
  return fallback;
}
