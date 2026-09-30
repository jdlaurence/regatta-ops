import { Navigate, Outlet, useLocation } from 'react-router';
import { useCurrentUser } from '@/data';

/** Routes below this need a signed-in user; everyone else goes to /sign-in and comes back. */
export function RequireAuth() {
  const user = useCurrentUser();
  const location = useLocation();
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    const to = next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`;
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}
