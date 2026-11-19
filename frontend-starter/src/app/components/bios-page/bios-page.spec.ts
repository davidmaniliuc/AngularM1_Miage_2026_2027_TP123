import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { Bios } from '../../shared/models/bios.model';
import { BiosPageComponent } from './bios-page';

const KNOWN: Bios = {
  id: 'b1',
  ownerId: 'u1',
  originalName: 'SCPH-1001.bin',
  size: 524288,
  known: true,
  region: 'america',
  version: '2.2',
  description: 'SCPH-1001, 5003',
  isDefault: true,
  createdAt: '2026-11-12T00:00:00Z',
};
const UNKNOWN: Bios = { ...KNOWN, id: 'b2', originalName: 'maison.bin', known: false, region: undefined, version: undefined, description: undefined, isDefault: false };

describe('BiosPageComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BiosPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  function render(list: Bios[]) {
    const fixture = TestBed.createComponent(BiosPageComponent);
    httpMock.expectOne('/api/bios').flush(list);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the region and version of a recognised BIOS, and which one is default', () => {
    const fixture = render([KNOWN, UNKNOWN]);
    const items = fixture.nativeElement.querySelectorAll('[data-testid="bios"]') as NodeListOf<HTMLElement>;

    expect(items[0].querySelector('[data-testid="bios-identity"]')?.textContent).toContain('Amérique · version 2.2');
    expect(items[0].querySelector('[data-testid="default"]')).not.toBeNull();
    expect(items[1].querySelector('[data-testid="bios-identity"]')?.textContent).toContain('Non reconnu');
    expect(items[1].querySelector('[data-testid="make-default"]')).not.toBeNull();
  });

  it('shows why a file is refused', () => {
    const fixture = render([]);
    const input = fixture.nativeElement.querySelector('[data-testid="bios-input"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'notes.txt')] });
    input.dispatchEvent(new Event('change'));

    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === '/api/bios')
      .flush(
        { message: "Ce fichier n'est pas un BIOS PS1 (il doit faire exactement 512 Ko)", code: 'BAD_BIOS_SIZE' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('512 Ko');
  });

  it('makes a BIOS the default and reloads the list', () => {
    const fixture = render([KNOWN, UNKNOWN]);
    (fixture.nativeElement.querySelector('[data-testid="make-default"]') as HTMLButtonElement).click();

    const patch = httpMock.expectOne((r) => r.method === 'PATCH' && r.url === '/api/bios/b2');
    expect(patch.request.body).toEqual({ isDefault: true });
    patch.flush({ ...UNKNOWN, isDefault: true });
    httpMock.expectOne('/api/bios').flush([{ ...UNKNOWN, isDefault: true }, { ...KNOWN, isDefault: false }]);
  });
});
