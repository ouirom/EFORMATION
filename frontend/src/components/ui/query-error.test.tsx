import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryError } from './query-error';

describe('QueryError', () => {
  it('renders the error message', () => {
    render(<QueryError />);
    expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();
  });

  it('does not render a retry button when onRetry is not provided', () => {
    render(<QueryError />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a retry button and calls onRetry when clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<QueryError onRetry={onRetry} />);

    const button = screen.getByRole('button', { name: 'Actualiser' });
    await user.click(button);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
