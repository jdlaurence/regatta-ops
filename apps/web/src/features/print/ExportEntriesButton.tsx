// "Export entries": downloads the regatta's entries as CSV, or one team's with `teamId`.

import { Download } from 'lucide-react';
import { useRegattaWorkingSet } from '@/data';
import { toast } from '@/components/toast';
import { Button, type ButtonProps } from '@/components/ui/button';
import { downloadText, entriesCsv, entriesCsvFileName } from './export';

export interface ExportEntriesButtonProps {
  regattaId: string;
  /** Only this team's entries; every team when omitted. */
  teamId?: string | null;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}

export function ExportEntriesButton({
  regattaId,
  teamId = null,
  variant = 'secondary',
  size = 'sm',
  className,
}: ExportEntriesButtonProps) {
  const ws = useRegattaWorkingSet(regattaId);
  const data = ws.data;
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={!data}
      onClick={() => {
        if (!data) return;
        try {
          downloadText(entriesCsvFileName(data, teamId), entriesCsv(data, { teamId }));
          toast.success('Entries exported');
        } catch {
          toast.error('The export did not download. Try again.');
        }
      }}
    >
      <Download aria-hidden />
      Export entries
    </Button>
  );
}
