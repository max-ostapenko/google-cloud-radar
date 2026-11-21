/**
 * Open and automerge a pull request for discovery document updates.
 *
 * Checks if there are local changes in discoveries/ or data/, commits them,
 * pushes to a remote fork, opens a pull request via `gh`, and configures automerge.
 */

import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';
import { extractStructuredDiffs } from './diff_preprocessor.ts';

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
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 50 * 1024 * 1024,
  });
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

export function formatPrBody(diffs: Array<Record<string, any>>): string {
  if (!diffs || diffs.length === 0) {
    return PULL_REQUEST_BODY;
  }

  let totalAdded = 0;
  let totalRemoved = 0;
  let totalModified = 0;
  let breakingServicesCount = 0;

  for (const diff of diffs) {
    const stats = diff._stats || {};
    const addedCount = stats.added_count ?? diff.added?.length ?? 0;
    const removedCount = stats.removed_count ?? diff.removed?.length ?? 0;
    const modifiedCount = stats.modified_count ?? diff.modified?.length ?? 0;
    const isBreaking = Boolean(diff.is_breaking || stats.is_breaking);

    totalAdded += addedCount;
    totalRemoved += removedCount;
    totalModified += modifiedCount;
    if (isBreaking) {
      breakingServicesCount += 1;
    }
  }

  const hasBreaking = breakingServicesCount > 0;
  const breakingBadgeSummary = hasBreaking ? `${breakingServicesCount} 🚨` : 'None ✅';

  let markdown = `${PULL_REQUEST_BODY}\n\n`;
  markdown += `## 📊 Discovery Document Updates\n\n`;
  markdown += `### Summary Statistics\n`;
  markdown += `- **Services Updated:** ${diffs.length}\n`;
  markdown += `- **Breaking Changes:** ${breakingBadgeSummary}\n`;
  markdown += `- **Total Additions:** ${totalAdded}\n`;
  markdown += `- **Total Removals:** ${totalRemoved}\n`;
  markdown += `- **Total Modifications:** ${totalModified}\n\n`;

  markdown += `### Service Updates\n\n`;
  markdown += `| Service / API | Status | Added | Removed | Modified | Impacted Methods |\n`;
  markdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  const breakingDetails: string[] = [];

  for (const diff of diffs) {
    const apiName = diff.api || 'unknown';
    const stats = diff._stats || {};
    const addedCount = stats.added_count ?? diff.added?.length ?? 0;
    const removedCount = stats.removed_count ?? diff.removed?.length ?? 0;
    const modifiedCount = stats.modified_count ?? diff.modified?.length ?? 0;
    const isBreaking = Boolean(diff.is_breaking || stats.is_breaking);
    const breakingReasons: string[] = diff.breaking_reasons || stats.breaking_reasons || [];

    const statusBadge = isBreaking ? '🚨 BREAKING' : '✅ Compatible';

    let methodsDisplay = '-';
    if (Array.isArray(diff.extracted_methods) && diff.extracted_methods.length > 0) {
      const topMethods = diff.extracted_methods.slice(0, 3).map((m: string) => `\`${m}\``);
      if (diff.extracted_methods.length > 3) {
        topMethods.push(`+${diff.extracted_methods.length - 3} more`);
      }
      methodsDisplay = topMethods.join(', ');
    } else if (Array.isArray(diff.target_paths) && diff.target_paths.length > 0) {
      const topPaths = diff.target_paths.slice(0, 2).map((p: string) => `\`${p}\``);
      if (diff.target_paths.length > 2) {
        topPaths.push(`+${diff.target_paths.length - 2} more`);
      }
      methodsDisplay = topPaths.join(', ');
    }

    markdown += `| \`${apiName}\` | ${statusBadge} | ${addedCount} | ${removedCount} | ${modifiedCount} | ${methodsDisplay} |\n`;

    if (isBreaking && breakingReasons.length > 0) {
      breakingDetails.push(`- **\`${apiName}\`**:\n` + breakingReasons.map((r) => `  - ${r}`).join('\n'));
    }
  }

  if (breakingDetails.length > 0) {
    markdown += `\n### 🚨 Breaking Change Details\n\n`;
    markdown += breakingDetails.join('\n\n') + '\n';
  }

  const jsonMetadata = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    has_breaking_changes: hasBreaking,
    summary: {
      total_services: diffs.length,
      breaking_services: breakingServicesCount,
      total_added: totalAdded,
      total_removed: totalRemoved,
      total_modified: totalModified,
    },
    services: diffs.map((diff) => {
      const stats = diff._stats || {};
      const addedCount = stats.added_count ?? diff.added?.length ?? 0;
      const removedCount = stats.removed_count ?? diff.removed?.length ?? 0;
      const modifiedCount = stats.modified_count ?? diff.modified?.length ?? 0;
      const isBreaking = Boolean(diff.is_breaking || stats.is_breaking);

      return {
        api: diff.api,
        is_breaking: isBreaking,
        breaking_reasons: diff.breaking_reasons || stats.breaking_reasons || [],
        extracted_methods: (diff.extracted_methods || []).slice(0, 50),
        target_paths: (diff.target_paths || []).slice(0, 50),
        stats: {
          added: addedCount,
          removed: removedCount,
          modified: modifiedCount,
        },
      };
    }),
  };

  const metadataComment = `\n<!-- AGENT_METADATA:\n${JSON.stringify(jsonMetadata, null, 2)}\n-->`;

  let fullBody = markdown + metadataComment;

  // Enforce total size limit of 60,000 characters
  if (fullBody.length > 60000) {
    let compactComment = `\n<!-- AGENT_METADATA:\n${JSON.stringify({
      version: '1.0',
      has_breaking_changes: hasBreaking,
      summary: jsonMetadata.summary,
      services: jsonMetadata.services.map((s) => ({
        api: s.api,
        is_breaking: s.is_breaking,
        breaking_reasons: s.breaking_reasons,
        methods_count: s.extracted_methods.length,
        stats: s.stats,
      })),
    })}\n-->`;
    if (compactComment.length > 30000) {
      compactComment = `\n<!-- AGENT_METADATA:\n${JSON.stringify({
        version: '1.0',
        has_breaking_changes: hasBreaking,
        summary: jsonMetadata.summary,
        truncated: true,
      })}\n-->`;
    }
    const suffix = '\n\n... (content truncated for size)\n' + compactComment;
    const maxMarkdownLen = Math.max(0, 60000 - suffix.length);
    fullBody = markdown.slice(0, maxMarkdownLen) + suffix;
  }

  return fullBody;
}

export function generatePrBody(diffs?: Array<Record<string, any>>): string {
  if (diffs) {
    return formatPrBody(diffs);
  }

  // Inspect worktree changes first (uncommitted / staged)
  let detectedDiffs = extractStructuredDiffs('HEAD', 'WORKTREE');
  if (detectedDiffs.length === 0) {
    // Try inspecting latest committed diff (HEAD~1 against HEAD)
    detectedDiffs = extractStructuredDiffs('HEAD~1', 'HEAD');
  }

  return formatPrBody(detectedDiffs);
}

export function createPr(branch: string, body?: string): string {
  console.log('Creating pull request.');
  const prBody = body || generatePrBody();
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
      prBody,
    ],
    { check: true }
  );

  const urlMatch = prOutput.match(/\/pull\/(\d+)/);
  const lines = prOutput.split('\n').filter(Boolean);
  const lastLine = lines[lines.length - 1] || '';
  const prNumber = urlMatch ? urlMatch[1] : (lastLine.split('/').pop()?.match(/^\d+$/)?.[0] || '');
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

export function mergePr(prNumber: string, githubToken?: string): void {
  const approvalToken = process.env[APPROVAL_TOKEN_ENV];
  if (approvalToken) {
    process.env[MAIN_TOKEN_ENV] = approvalToken;
    console.log('Approving pull request ...');
    runCmd(
      'gh',
      [
        'pr',
        'review',
        prNumber,
        '--repo',
        REPO_NAME,
        '--approve',
        '--body',
        APPROVAL_MESSAGE,
      ],
      { check: false }
    );
    if (githubToken) {
      process.env[MAIN_TOKEN_ENV] = githubToken;
    } else {
      delete process.env[MAIN_TOKEN_ENV];
    }
  }

  console.log('Directly merging pull request ...');
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      runCmd(
        'gh',
        ['pr', 'merge', prNumber, '--repo', REPO_NAME, '--squash', '--delete-branch'],
        { check: true }
      );
      console.log(`Successfully merged pull request #${prNumber}.`);
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        throw err;
      }
      console.log(`Merge attempt ${attempt} failed, waiting before retrying...`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 2000);
    }
  }
}

export const updatePr = mergePr;

export function main(): void {
  if (hasChanges()) {
    console.log('Git changes detected. Opening pull request ...');
    ensureGitIdentity();
    const githubToken = process.env[MAIN_TOKEN_ENV];
    const username = GIT_USER_NAME;
    const forkRepoName = REPO_NAME.replace(/^[^/]+\//, `${username}/`);
    ensureGitRemote(githubToken, username, forkRepoName);

    const branch = commitChanges();
    pushChanges(branch);
    const prNumber = createPr(branch);
    mergePr(prNumber, githubToken);
    console.log('Complete.');
  } else {
    console.log('No git changes. Bailing.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
