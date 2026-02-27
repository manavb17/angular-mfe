import { Component } from '@angular/core';
import { Route } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';

@Component({
  template: `<p style="color: #555;">Select a micro-frontend from the nav above.</p>`,
})
class HomeComponent {}

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    component: HomeComponent,
  },
  {
    path: 'mfe1',
    loadComponent: () =>
      loadRemoteModule('mfe1', './Component').then((m) => m.App),
  },
  {
    path: 'mfe2',
    loadComponent: () =>
      loadRemoteModule('mfe2', './Component').then((m) => m.App),
  },
];
