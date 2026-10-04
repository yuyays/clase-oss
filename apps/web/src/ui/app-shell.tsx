import { Link, Outlet, useRouterState } from '@tanstack/react-router';

import { cn } from '@/lib/utils';
import { useAppCopy } from '@/ui/use-app-copy';
import { useLocale } from '@/ui/locale';

export const AppShell = () => {
  const copy = useAppCopy();
  const { locale, setLocale } = useLocale();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isEditorRoute = pathname.startsWith('/editor');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="print-hidden border-b border-border bg-card">
        <div
          className={cn(
            'mx-auto flex w-full max-w-full min-w-0 flex-wrap items-center justify-between gap-3 px-2.5 py-3 sm:px-4 md:h-16 md:flex-nowrap md:gap-6 md:px-5 md:py-0 xl:px-8',
            isEditorRoute ? 'max-w-[1440px]' : 'max-w-[1280px]',
          )}
        >
          <div className="shrink-0 text-lg font-semibold tracking-tight">Clase</div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:gap-3 md:w-auto md:flex-nowrap md:gap-6">
            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground md:flex-none md:gap-6">
              <Link to="/" className="transition hover:text-foreground">
                {copy.nav.upload}
              </Link>
            </nav>
            <div className="ml-auto inline-flex shrink-0 items-center rounded-lg border border-border bg-background p-1 text-xs">
              <button
                type="button"
                onClick={() => setLocale('ja')}
                className={
                  locale === 'ja'
                    ? 'rounded-md bg-foreground px-3 py-1 text-background'
                    : 'rounded-md px-3 py-1 text-muted-foreground hover:text-foreground'
                }
              >
                日本語
              </button>
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={
                  locale === 'en'
                    ? 'rounded-md bg-foreground px-3 py-1 text-background'
                    : 'rounded-md px-3 py-1 text-muted-foreground hover:text-foreground'
                }
              >
                English
              </button>
            </div>
          </div>
        </div>
      </header>
      <main
        className={cn(
          'mx-auto w-full max-w-full px-2.5 pb-10 sm:px-4 md:px-5 xl:px-8',
          isEditorRoute ? 'max-w-[1440px]' : 'max-w-[1280px]',
          isEditorRoute ? 'pt-0' : 'pt-10',
        )}
      >
        <Outlet />
      </main>
    </div>
  );
};
