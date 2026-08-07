import { authorize, ROLE_HIERARCHY } from './auth.middleware';

describe('ROLE_HIERARCHY', () => {
  it('gives externe and stagiaire the same level as agent', () => {
    expect(ROLE_HIERARCHY.externe).toBe(ROLE_HIERARCHY.agent);
    expect(ROLE_HIERARCHY.stagiaire).toBe(ROLE_HIERARCHY.agent);
    expect(ROLE_HIERARCHY.agent).toBe(1);
  });
});

describe('authorize', () => {
  function callAuthorize(allowedRoles: string[], userRole: string): any {
    const req: any = { user: { role: userRole } };
    let result: any = 'not-called';
    const next = (err?: any) => {
      result = err ?? 'next-called-without-error';
    };
    authorize(...allowedRoles)(req, {}, next);
    return result;
  }

  it('grants access to externe/stagiaire wherever agent is allowed, via the shared hierarchy level', () => {
    expect(callAuthorize(['admin', 'director', 'manager', 'agent'], 'externe')).toBe('next-called-without-error');
    expect(callAuthorize(['admin', 'director', 'manager', 'agent'], 'stagiaire')).toBe('next-called-without-error');
  });

  it('still blocks externe/stagiaire from routes restricted to a higher role level', () => {
    const externeResult = callAuthorize(['admin', 'director', 'manager'], 'externe');
    const stagiaireResult = callAuthorize(['admin', 'director', 'manager'], 'stagiaire');
    expect(externeResult.statusCode).toBe(403);
    expect(stagiaireResult.statusCode).toBe(403);
  });

  it('treats agent/externe/stagiaire as fully interchangeable at their shared level', () => {
    // authorize() gates on minimum level, not exact role — sharing agent's level
    // means each can stand in for the others wherever 'agent' is allowed.
    expect(callAuthorize(['agent'], 'externe')).toBe('next-called-without-error');
    expect(callAuthorize(['agent'], 'stagiaire')).toBe('next-called-without-error');
    expect(callAuthorize(['externe'], 'agent')).toBe('next-called-without-error');
    expect(callAuthorize(['externe'], 'stagiaire')).toBe('next-called-without-error');
  });
});
