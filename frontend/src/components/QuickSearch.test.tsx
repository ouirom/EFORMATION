import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { QuickSearch } from './QuickSearch';

let role = 'admin';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role } }) }));
vi.mock('@/services/api', () => ({ api: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));

function CurrentPath() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function renderSearch() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <QuickSearch />
        <Routes>
          <Route path="*" element={<CurrentPath />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('fr');
});

describe('QuickSearch tab search', () => {
  it('lists matching tabs from the first letters, accent-insensitively, with their section', async () => {
    role = 'admin';
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole('combobox'), 'rapp');

    const option = screen.getByRole('option', { name: /Rapports/ });
    expect(option).toHaveTextContent('Administration');
  });

  it('opens the highlighted tab with the keyboard', async () => {
    role = 'admin';
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole('combobox'), 'rapports');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByTestId('path')).toHaveTextContent('/admin/reports');
  });

  it('only offers administration tabs to roles that can reach them', async () => {
    role = 'agent';
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole('combobox'), 'rapp');

    expect(screen.queryByRole('option', { name: /Rapports/ })).not.toBeInTheDocument();
  });

  it('focuses the search box with Ctrl+K', async () => {
    role = 'admin';
    const user = userEvent.setup();
    renderSearch();

    await user.keyboard('{Control>}k{/Control}');

    expect(screen.getByRole('combobox')).toHaveFocus();
  });
});
