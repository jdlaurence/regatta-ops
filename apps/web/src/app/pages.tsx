// App-level pages: not found and the route error boundary.

import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/states';

export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Page not found" />
      <EmptyState
        title="Nothing lives at this address"
        description="Check the link, or go back to the regattas list."
        action={
          <Button asChild variant="primary">
            <Link to="/">Go to regattas</Link>
          </Button>
        }
      />
    </div>
  );
}

/** Shown when a route throws or its page fails to load (a stale deploy, say). */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <div className="p-4 md:p-8">
      <ErrorState
        title="This page did not load."
        error={error}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}
