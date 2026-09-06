import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('renders the title and description when open', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Supprimer le cours"
        description="Cette action est irréversible."
        onConfirm={() => {}}
      />
    );

    expect(screen.getByText('Supprimer le cours')).toBeInTheDocument();
    expect(screen.getByText('Cette action est irréversible.')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="Supprimer le cours"
        description="Cette action est irréversible."
        onConfirm={() => {}}
      />
    );

    expect(screen.queryByText('Supprimer le cours')).not.toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Supprimer le cours"
        description="Cette action est irréversible."
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not call onConfirm when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Supprimer le cours"
        description="Cette action est irréversible."
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('supports custom confirm/cancel labels', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Archiver"
        description="Confirmez l'archivage."
        onConfirm={() => {}}
        confirmLabel="Archiver maintenant"
        cancelLabel="Retour"
      />
    );

    expect(screen.getByRole('button', { name: 'Archiver maintenant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument();
  });
});
