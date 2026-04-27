import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './layouts/RootLayout';
import { HomePage } from './pages/HomePage';
import { CurriculumMapPage } from './pages/CurriculumMapPage';
import { SupermodulePage } from './pages/SupermodulePage';
import { ModulePage } from './pages/ModulePage';
import { ProgressPage } from './pages/ProgressPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'curriculum', element: <CurriculumMapPage /> },
      { path: 'supermodule/:supermoduleSlug', element: <SupermodulePage /> },
      { path: 'module/:moduleSlug', element: <ModulePage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
], { basename: '/UnderstandingLinux' });
