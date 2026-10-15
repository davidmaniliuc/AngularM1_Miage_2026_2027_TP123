import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { LoginPageComponent } from './components/login-page/login-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { GamesPageComponent } from './components/games-page/games-page';
import { GamesLibraryComponent } from './components/games-library/games-library';
import { BiosPageComponent } from './components/bios-page/bios-page';
import { TracksPageComponent } from './components/tracks-page/tracks-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'games' },
  { path: 'login', component: LoginPageComponent },
  { path: 'register', component: RegisterPageComponent },
  { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
  {
    path: 'games',
    component: GamesPageComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: GamesLibraryComponent },
      { path: 'bios', component: BiosPageComponent },
    ],
  },
  { path: 'tracks', component: TracksPageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'games' },
];
