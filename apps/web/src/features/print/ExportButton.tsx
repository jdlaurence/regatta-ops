// "Export to Excel": downloads the print view on screen as a workbook.

import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from '@/components/toast';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { ExportSheet } from './export';
import { downloadWorkbook } from './xlsx';

export interface ExportButtonProps {
  fileName: string;
  /** The sheets of the view as it stands; null while it is loading. */
  sheets: (() => ExportSheet[]) | null;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}

export function ExportButton({
  fileName,
  sheets,
  variant = 'secondary',
  size = 'sm',
  className,
}: ExportButtonProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={!sheets || busy}
      onClick={async () => {
        if (!sheets) return;
        setBusy(true);
        try {
          await downloadWorkbook(fileName, sheets());
          toast.success('Exported to Excel');
        } catch {
          toast.error('The export did not download. Try again.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download aria-hidden />
      Export to Excel
    </Button>
  );
}
