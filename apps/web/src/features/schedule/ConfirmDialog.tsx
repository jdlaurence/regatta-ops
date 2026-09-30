// A promise-based confirmation for edits on a final regatta (PLAN.md §4.1: "final" asks before
// each edit; it does not lock).
//
//   const { confirm, dialog } = useConfirm();
//   if (await confirm({ title, description, action: 'Save change' })) save();
//   return <>{...}{dialog}</>;

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import type { ConfirmFn } from './hooks';

interface Request {
  title: string;
  description: string;
  action: string;
  resolve: (ok: boolean) => void;
}

export function useConfirm() {
  const [req, setReq] = useState<Request | null>(null);
  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setReq({ ...opts, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  const dialog = (
    <Dialog open={!!req} onOpenChange={(open) => !open && close(false)}>
      {req && (
        <DialogContent title={req.title} description={req.description}>
          <DialogFooter>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => close(true)} autoFocus>
              {req.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
  return { confirm, dialog };
}
