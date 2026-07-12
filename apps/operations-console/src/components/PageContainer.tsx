export type PageState = 'LOADING' | 'READY' | 'ERROR';

export interface PageContainerProps {
  pageId: string;
  state?: PageState;
  title?: string;
  children?: React.ReactNode;
}

export function PageContainer({
  pageId,
  state = 'READY',
  title,
  children,
}: PageContainerProps): JSX.Element {
  const isBusy = state === 'LOADING';
  const isError = state === 'ERROR';

  return (
    <div
      data-page-id={pageId}
      data-page-state={state}
      aria-busy={isBusy}
      role="main"
    >
      {title !== undefined && (
        <header className="page-header">
          <h1>{title}</h1>
        </header>
      )}
      {isBusy && (
        <div data-testid="page-loading" className="page-loading">
          Loading…
        </div>
      )}
      {isError && (
        <div data-testid="page-error" className="page-error" role="alert">
          An error occurred while loading this page.
        </div>
      )}
      {state === 'READY' && children}
    </div>
  );
}
