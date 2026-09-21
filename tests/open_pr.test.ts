import { describe, it, expect, vi } from 'vitest';
import {
  generateBranchName,
  COMMIT_MESSAGE,
  PULL_REQUEST_BODY,
  APPROVAL_MESSAGE,
  REPO_NAME,
  GIT_USER_NAME,
} from '../scripts/open_pr.ts';

describe('open_pr', () => {
  it('generates branch names matching autopr/<hex> format', () => {
    const branch1 = generateBranchName();
    const branch2 = generateBranchName();
    expect(branch1).toMatch(/^autopr\/[0-9a-f]{32}$/);
    expect(branch2).toMatch(/^autopr\/[0-9a-f]{32}$/);
    expect(branch1).not.toBe(branch2);
  });

  it('maintains expected PR metadata constants', () => {
    expect(COMMIT_MESSAGE).toBe('chore: Automated update of discovery documents');
    expect(PULL_REQUEST_BODY).toBe('Automatically created by the update_disco script.');
    expect(APPROVAL_MESSAGE).toBe('Rubber-stamped automated update of discovery documents!');
    expect(REPO_NAME).toBe('max-ostapenko/google-cloud-radar');
    expect(GIT_USER_NAME).toBe('max-ostapenko');
  });
});
