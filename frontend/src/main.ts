import { bootstrapApplication } from '@angular/platform-browser';
import { inject } from '@vercel/analytics';
import { isDevMode } from '@angular/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Initialize Vercel Web Analytics
inject({
  mode: isDevMode() ? 'development' : 'production',
  debug: isDevMode(),
});

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
