import {
  Navigate,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import { AppShell } from '@/ui/app-shell';
import { EditorRoute } from '@/routes/editor';
import { PrintEditorRoute } from '@/routes/print-editor';
import { UploadRoute } from '@/routes/upload';

const rootRoute = createRootRoute({
  component: AppShell,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  component: () => <Navigate to="/" />,
});

const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: UploadRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    assessmentId: typeof search.assessmentId === 'string' ? search.assessmentId : undefined,
  }),
});

const uploadAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upload',
  component: UploadRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    assessmentId: typeof search.assessmentId === 'string' ? search.assessmentId : undefined,
  }),
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor',
  component: () => <Navigate to="/" />,
});

const editorNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor/new',
  component: () => <Navigate to="/" />,
});

const editorAssessmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor/$assessmentId',
  component: () => {
    const { assessmentId } = editorAssessmentRoute.useParams();
    return <EditorRoute key={assessmentId} initialAssessmentId={assessmentId} />;
  },
});

const printEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/print-editor/$assessmentId',
  component: PrintEditorRoute,
});

const routeTree = rootRoute.addChildren([
  libraryRoute,
  uploadRoute,
  uploadAliasRoute,
  editorRoute,
  editorNewRoute,
  editorAssessmentRoute,
  printEditorRoute,
]);

export const router = createRouter({ routeTree });

export const AppRouter = () => <RouterProvider router={router} />;
