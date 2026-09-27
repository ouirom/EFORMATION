import { describe, it, expect } from 'vitest';
import { adminSectionNavItems, userSpaceNavItems } from './navigation';

const paths = (items: { path: string }[]) => items.map((i) => i.path);

describe('navigation module switches', () => {
  it('shows every tab when all modules are on (default)', () => {
    expect(paths(userSpaceNavItems('agent'))).toEqual(expect.arrayContaining(['/chat', '/live']));
    expect(paths(adminSectionNavItems('admin'))).toContain('/admin/live-sessions');
  });

  it('hides the chat tab when the chat is off', () => {
    const items = paths(userSpaceNavItems('agent', { chat: false, liveSessions: true }));
    expect(items).not.toContain('/chat');
    expect(items).toContain('/live');
  });

  it('hides live sessions in both the personal space and administration when off', () => {
    const modules = { chat: true, liveSessions: false };
    expect(paths(userSpaceNavItems('manager', modules))).not.toContain('/live');
    expect(paths(adminSectionNavItems('admin', modules))).not.toContain('/admin/live-sessions');
    expect(paths(userSpaceNavItems('manager', modules))).toContain('/my-team');
  });
});
