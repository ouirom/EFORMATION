import { describe, it, expect } from 'vitest';
import { adminSectionNavItems, userSpaceNavItems } from './navigation';

const paths = (items: { path: string }[]) => items.map((i) => i.path);

describe('navigation module switches', () => {
  it('shows every tab when all modules are on (default)', () => {
    expect(paths(userSpaceNavItems('agent'))).toEqual(expect.arrayContaining(['/chat', '/live']));
    expect(paths(adminSectionNavItems('admin'))).toContain('/admin/live-sessions');
  });

  it('hides the chat tab when the chat is off', () => {
    const items = paths(userSpaceNavItems('agent', { chat: false, liveSessions: true, badges: true }));
    expect(items).not.toContain('/chat');
    expect(items).toContain('/live');
  });

  it('hides live sessions in both the personal space and administration when off', () => {
    const modules = { chat: true, liveSessions: false, badges: true };
    expect(paths(userSpaceNavItems('manager', modules))).not.toContain('/live');
    expect(paths(adminSectionNavItems('admin', modules))).not.toContain('/admin/live-sessions');
    expect(paths(userSpaceNavItems('manager', modules))).toContain('/my-team');
  });

  it('shows the sign-in monitoring screen to admins only', () => {
    expect(paths(adminSectionNavItems('admin'))).toContain('/admin/connections')
    expect(paths(adminSectionNavItems('super_admin'))).toContain('/admin/connections')
    expect(paths(adminSectionNavItems('director'))).not.toContain('/admin/connections')
    expect(paths(adminSectionNavItems('manager'))).not.toContain('/admin/connections')
  })

  it('hides the badges tab for learners but keeps badge administration', () => {
    const modules = { chat: true, liveSessions: true, badges: false };
    expect(paths(userSpaceNavItems('agent', modules))).not.toContain('/badges');
    expect(paths(adminSectionNavItems('admin', modules))).toContain('/admin/badges');
  });
});
