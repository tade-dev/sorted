import { describe, expect, it } from 'vitest';
import { parseServiceAccount } from '../src/firebase.js';

describe('parseServiceAccount', () => {
  it.each([undefined, '', '   ', '\n'])(
    'returns null for %j so startup falls back to default credentials',
    (raw) => {
      expect(parseServiceAccount(raw)).toBeNull();
    },
  );

  it('parses a real service-account blob', () => {
    const blob = JSON.stringify({ type: 'service_account', project_id: 'p' });
    expect(parseServiceAccount(blob)).toEqual({
      type: 'service_account',
      project_id: 'p',
    });
  });

  it('tolerates surrounding whitespace from a dashboard paste', () => {
    const blob = `  ${JSON.stringify({ project_id: 'p' })}\n`;
    expect(parseServiceAccount(blob)).toEqual({ project_id: 'p' });
  });

  it('names the variable when a placeholder was pasted instead of JSON', () => {
    // "pending" in a hosting dashboard would otherwise surface as a bare
    // SyntaxError from inside startup, with nothing pointing at the cause.
    expect(() => parseServiceAccount('pending')).toThrow(
      /FIREBASE_SERVICE_ACCOUNT_JSON/,
    );
  });

  it('explains the fix in the error message', () => {
    expect(() => parseServiceAccount('{broken')).toThrow(/leave the variable empty/);
  });
});
