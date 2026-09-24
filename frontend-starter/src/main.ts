import { bootstrapApplication } from "@angular/platform-browser";
import { LOCALE_ID, provideAppInitializer, inject } from "@angular/core";
import { registerLocaleData } from "@angular/common";
import localeFr from "@angular/common/locales/fr";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { MatIconRegistry } from "@angular/material/icon";
import { MatPaginatorIntl } from "@angular/material/paginator";
import { AppComponent } from './app/components/app/app';
import { routes } from './app/routes';
import { authInterceptor } from './app/shared/interceptors/auth.interceptor';
import { AuthService } from './app/shared/services/auth.service';
import { FrenchPaginatorIntl } from './app/shared/i18n/french-paginator-intl';

registerLocaleData(localeFr);

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    // <mat-icon> uses the Material Symbols Rounded font loaded in index.html.
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded');
    }),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
    { provide: MatPaginatorIntl, useClass: FrenchPaginatorIntl },
  ],
}).catch(console.error);
