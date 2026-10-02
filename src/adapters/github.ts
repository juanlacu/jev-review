// GitHub adapter: reads the pull request that triggered a workflow run and
// publishes one review with inline comments through the REST API.
import { readFileSync } from "node:fs";

export type PullRequest = {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
};

export type ReviewComment = {
  path: string;
  line: number;
  body: string;
};

export class GitHubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Reads the pull_request event payload GitHub Actions writes to disk.
export function pullRequestFromEvent(eventPath: string): PullRequest {
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const pullRequest = event.pull_request;
  if (!pullRequest) throw new Error("The triggering event is not a pull_request event");
  return {
    owner: event.repository.owner.login,
    repo: event.repository.name,
    number: pullRequest.number,
    headSha: pullRequest.head.sha,
  };
}

export async function postReview(
  token: string,
  pr: PullRequest,
  review: { body: string; comments: ReviewComment[] },
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        commit_id: pr.headSha,
        event: "COMMENT",
        body: review.body,
        comments: review.comments.map((comment) => ({ ...comment, side: "RIGHT" })),
      }),
    },
  );
  if (!response.ok) {
    throw new GitHubError(response.status, `GitHub review failed (${response.status}): ${await response.text()}`);
  }
  const created = (await response.json()) as { html_url: string };
  return created.html_url;
}
