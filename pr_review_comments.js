import 'dotenv/config';
import fetch from 'node-fetch';
import process from 'process';
import fs from 'fs';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'YOUR_GITHUB_TOKEN'; // 環境変数優先
const OWNER = process.env.OWNER || 'YOUR_OWNER';
const REPO = process.env.REPO || 'YOUR_REPO';
const TARGET_USER = process.env.TARGET_USER || 'TARGET_USER';
const BOT_USERS = [
  'github-actions[bot]',
  'notion-workspace[bot]',
  'coderabbitai[bot]'
  // 必要に応じて他のbot名も追加
];

// 半年前の日付を計算
const today = new Date();
const halfYearAgo = new Date(today);
halfYearAgo.setMonth(today.getMonth() - 6);

async function fetchAllPRs(owner, repo) {
  let prs = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=100&page=${page}`,
      {
        headers: { Authorization: `token ${GITHUB_TOKEN}` },
      }
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    prs = prs.concat(data);
    page++;
  }
  return prs;
}

async function hasUserCommit(owner, repo, prNumber, username) {
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100&page=${page}`,
      {
        headers: { Authorization: `token ${GITHUB_TOKEN}` },
      }
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    if (data.some(commit => commit.author && commit.author.login === username)) {
      return true;
    }
    page++;
  }
  return false;
}

async function fetchReviewComments(owner, repo, prNumber) {
  let comments = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100&page=${page}`,
      {
        headers: { Authorization: `token ${GITHUB_TOKEN}` },
      }
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    comments = comments.concat(data);
    page++;
  }
  return comments;
}

async function main() {
  const prs = await fetchAllPRs(OWNER, REPO);
  const csvRows = [
    'pr_number,pr_title,comment_user,comment_body'
  ];
  for (const pr of prs) {
    // 半年以内のPRのみ対象
    const prCreatedAt = new Date(pr.created_at);
    if (prCreatedAt < halfYearAgo) continue;
    const hasCommit = await hasUserCommit(OWNER, REPO, pr.number, TARGET_USER);
    if (!hasCommit) continue;
    // reviewコメントのみ
    const reviewComments = await fetchReviewComments(OWNER, REPO, pr.number);
    for (const comment of reviewComments) {
      if (BOT_USERS.includes(comment.user.login)) continue;
      const prTitle = '"' + pr.title.replace(/"/g, '""') + '"';
      const commentUser = comment.user.login;
      const commentBody = '"' + comment.body.replace(/"/g, '""').replace(/\n/g, ' ') + '"';
      csvRows.push(`${pr.number},${prTitle},${commentUser},${commentBody}`);
    }
  }
  const outputFile = `${TARGET_USER}_pr_review_comments.csv`;
  fs.writeFileSync(outputFile, csvRows.join('\n'), 'utf8');
  console.log(`CSVファイル(${outputFile})に出力しました`);
}

main(); 