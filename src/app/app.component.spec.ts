import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  const apiUrl = '/api/links';
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should create the app', () => {
    const fixture = createLoadedFixture();
    expect(fixture.componentInstance).toBeTruthy();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Make every link');
  });

  it('rejects non-HTTP URLs without sending a request', () => {
    const fixture = createLoadedFixture();
    const app = fixture.componentInstance;
    app.urlControl.setValue('javascript:alert(1)');

    app.createLink();

    expect(app.urlControl.invalid).toBeTrue();
    expect(app.urlControl.hasError('httpUrl')).toBeTrue();
    httpTestingController.expectNone({ method: 'POST', url: apiUrl });
  });

  it('creates a link and refreshes the list without duplicate submissions', () => {
    const fixture = createLoadedFixture();
    const app = fixture.componentInstance;
    const link = {
      code: 'a1B2c3',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-11-12T00:00:00.000Z'
    };

    app.urlControl.setValue(link.url);
    app.createLink();
    app.createLink();

    const createRequest = httpTestingController.expectOne({ method: 'POST', url: apiUrl });
    expect(createRequest.request.body).toEqual({ url: link.url });
    createRequest.flush(link);
    httpTestingController.expectOne({ method: 'GET', url: apiUrl }).flush([link]);
    fixture.detectChanges();

    expect(app.createdLink()).toEqual(link);
    expect(app.links()).toEqual([link]);
    expect(app.urlControl.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain(link.shortUrl);
  });

  it('shows API validation errors beside the URL field', () => {
    const fixture = createLoadedFixture();
    const app = fixture.componentInstance;
    app.urlControl.setValue('https://example.com');
    app.createLink();

    httpTestingController.expectOne({ method: 'POST', url: apiUrl }).flush(
      { error: 'URL is not allowed.' },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    expect(app.submitError()).toBe('URL is not allowed.');
    const input = fixture.nativeElement.querySelector('#url-input') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('url-feedback');
    expect(fixture.nativeElement.textContent).toContain('URL is not allowed.');
  });

  function createLoadedFixture() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    httpTestingController.expectOne({ method: 'GET', url: apiUrl }).flush([]);
    fixture.detectChanges();
    return fixture;
  }
});
