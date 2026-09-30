// The page around every print view (PLAN.md §6.12): no app shell, a toolbar that does not
// print, and the sheet below it. WP-K owns this folder.

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintFrame({
  title,
  backTo,
  children,
}: {
  title: string;
  /** Where "Back" goes (the page this sheet was printed from). */
  backTo: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <div
        data-print="hide"
        className="sticky top-0 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2"
      >
        <Button asChild variant="ghost" size="sm">
          <Link to={backTo}>
            <ArrowLeft aria-hidden />
            Back
          </Link>
        </Button>
        <Button variant="primary" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden />
          Print
        </Button>
      </div>
      <main className="mx-auto max-w-[1000px] px-4 py-6 print:max-w-none print:p-0">
        <h1 className="mb-4 font-display text-xl font-semibold">{title}</h1>
        {children}
      </main>
    </div>
  );
}
