import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import './styles/globals.css';
import { createStore } from './data/create-store';
import { AppProviders, createQueryClient } from './app/providers';
import { createAppRouter } from './app/router';

const store = createStore();
const queryClient = createQueryClient();
const router = createAppRouter({ store, queryClient });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders store={store} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
