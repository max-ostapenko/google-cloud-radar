/**
 * Open and automerge a pull request for discovery document updates.
 *
 * Checks if there are local changes in discoveries/ or data/, commits them,
 * pushes to a remote fork, opens a pull request via `gh`, and configures automerge.
 */

import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';

export const REMOTE_NAME = 'yoshi-fork';
export const REPO_NAME = 'max-ostapenko/google-cloud-radar';
export const GIT_USER_NAME = 'max-ostapenko';
export const GIT_USER_EMAIL = '1611259+max-ostapenko@users.noreply.github.com';
export const COMMIT_MESSAGE = 'chore: Automated update of discovery documents';
export const PULL_REQUEST_BODY = 'Automatically created by the update_disco script.';
export const APPROVAL_MESSAGE = 'Rubber-stamped automated update of discovery documents!';
export const MAIN_TOKEN_ENV = 'GITHUB_TOKEN';
export const APPROVAL_TOKEN_ENV = 'APPROVAL_GITHUB_TOKEN';
export const CHANGE_SCOPE_PATHS = ['discoveries', 'data'];

export function runCmd(cmd: string, args: string[], options: { check?: boolean } = {}): string {
  const result = spawnSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (options.check && result.status !== 0) {
    throw new Error(`Command failed [${cmd} ${args.join(' ')}]: ${result.stderr}`);
  }
  return (result.stdout || '').trim();
}

export function hasChanges(scopePaths: string[] = CHANGE_SCOPE_PATHS): boolean {
  const stdout = runCmd('git', ['status', '-s', '--', ...scopePaths]);
  return stdout.length > 0;
}

export function ensureGitIdentity(): void {
  const name = runCmd('git', ['config', '--get', 'user.name']);
  if (!name) {
    console.log(`Setting git user.name to ${GIT_USER_NAME}`);
    runCmd('git', ['config', '--local', 'user.name', GIT_USER_NAME]);
  }
  const email = runCmd('git', ['config', '--get', 'user.email']);
  if (!email) {
    console.log(`Setting git user.email to ${GIT_USER_EMAIL}`);
    runCmd('git', ['config', '--local', 'user.email', GIT_USER_EMAIL]);
  }
}

export function ensureGitRemote(
  githubToken: string | undefined,
  username: string,
  forkRepoName: string
): void {
  const currentRemoteUrl = runCmd('git', ['remote', 'get-url', REMOTE_NAME]);
  if (currentRemoteUrl) {
    if (currentRemoteUrl.includes(forkRepoName)) {
      console.log(`Remote ${REMOTE_NAME} is already present and seems to reference the fork.`);
      return;
    }
    console.error(
      `Remote ${REMOTE_NAME} has URL ${currentRemoteUrl} which does not seem to reference ${forkRepoName}!`
    );
    process.exit(1);
  }

  let remoteUrl: string;
  if (!githubToken) {
    console.log(`Creating remote ${REMOTE_NAME} using ambient ssh credentials`);
    remoteUrl = `git@github.com:${forkRepoName}.git`;
  } else {
    console.log(`Creating remote ${REMOTE_NAME} via https using GITHUB_TOKEN`);
    remoteUrl = `https://${username}:${githubToken}@github.com/${forkRepoName}.git`;
  }

  runCmd('git', ['remote', 'add', REMOTE_NAME, remoteUrl], { check: true });
}

export function generateBranchName(): string {
  const randomHex = crypto.randomBytes(16).toString('hex');
  return `autopr/${randomHex}`;
}

export function commitChanges(scopePaths: string[] = CHANGE_SCOPE_PATHS): string {
  const branch = generateBranchName();
  console.log(`Committing changes to branch ${branch}.`);
  runCmd('git', ['switch', '-c', branch], { check: true });
  runCmd('git', ['add', '--', ...scopePaths], { check: true });
  runCmd('git', ['commit', '-m', COMMIT_MESSAGE], { check: true });
  return branch;
}

export function pushChanges(branch: string): void {
  console.log(`Pushing branch ${branch} to remote ${REMOTE_NAME}.`);
  runCmd('git', ['push', '-u', REMOTE_NAME, branch], { check: true });
}

export function createPr(branch: string): string {
  console.log('Creating pull request.');
  const prOutput = runCmd(
    'gh',
    [
      'pr',
      'create',
      '--repo',
      REPO_NAME,
      '--head',
      `${GIT_USER_NAME}:${branch}`,
      '--title',
      COMMIT_MESSAGE,
      '--body',
      PULL_REQUEST_BODY,
    ],
    { check: true }
  );

  const lines = prOutput.split('\n').filter(Boolean);
  const lastLine = lines[lines.length - 1];
  const prNumber = lastLine.split('/').pop() || '';
  console.log(`Pull request number is ${prNumber}.`);

  for (let count = 0; count < 5; count++) {
    const check = runCmd('gh', ['pr', 'view', prNumber, '--repo', REPO_NAME, '--json=number']);
    if (check) {
      console.log('Confirmed existence of new pull request.');
      break;
    }
    console.log("Couldn't confirm pull request yet ...");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (count + 1) * 1000);
  }

  return prNumber;
}

export function updatePr(prNumber: string, githubToken?: string): void {
  if (githubToken) {
    console.log('Enabling auto-merge ...');
    runCmd('gh', ['pr', 'merge', prNumber, '--repo', REPO_NAME, '--auto', '--squash']);
  }

  const approvalToken = process.env[APPROVAL_TOKEN_ENV];
  if (!approvalToken) {
    console.log('No approval token provided; skipping auto-approval');
  } else {
    process.env[MAIN_TOKEN_ENV] = approvalToken;
    console.log('Approving pull request ...');
    runCmd('gh', [
      'pr',
      'review',
      prNumber,
      '--repo',
      REPO_NAME,
      '--approve',
      '--body',
      APPROVAL_MESSAGE,
    ]);
    if (githubToken) {
      process.env[MAIN_TOKEN_ENV] = githubToken;
    } else {
      delete process.env[MAIN_TOKEN_ENV];
    }
    console.log('Done with automerge setup');
  }
}

export function main(): void {
  if (hasChanges()) {
    console.log('Git changes detected. Opening pull request ...');
    ensureGitIdentity();
    const githubToken = process.env[MAIN_TOKEN_ENV];
    const username = GIT_USER_NAME;
    const forkRepoName = REPO_NAME.replace('googleapis/', `${username}/`);
    ensureGitRemote(githubToken, username, forkRepoName);

    const branch = commitChanges();
    pushChanges(branch);
    const prNumber = createPr(branch);
    updatePr(prNumber, githubToken);
    console.log('Complete.');
  } else {
    console.log('No git changes. Bailing.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
