#!/usr/bin/env node
/**
 * ตรวจความสอดคล้องของ agent/skill definition ของ iServ BOQ
 *
 * - agent ต้องมีทั้ง .opencode/agents/<id>.md และ .claude/agents/<id>.md
 * - body ต้องตรงกัน (ต่างเฉพาะ frontmatter)
 * - frontmatter ต้องมี field ที่ runtime นั้นต้องใช้
 * - agent ที่อ้าง skill ต้องอ้าง skill ที่มีจริง
 * - boq-compliance-reviewer ต้องเป็น read-only
 * - ไม่มี secret/TODO/FIXME/TBD ในไฟล์ที่ใช้ production
 *
 * รัน: npm run verify:agents
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const notes = [];

const OPEN_AGENTS = path.join(root, ".opencode", "agents");
const CLAUDE_AGENTS = path.join(root, ".claude", "agents");
const SKILLS = path.join(root, ".claude", "skills");
const REVIEWER_ID = "boq-compliance-reviewer";

const SKILL_LIKE = /^(?:boq|iserv-boq|thai-govt|tpso)-[a-z0-9-]+$/;
const FORBIDDEN = /ghp_|github_pat_|sk-ant|AKIA|BEGIN [A-Z ]*PRIVATE KEY|TODO|FIXME|TBD/;

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function fail(message) {
  errors.push(message);
}

function normalize(text) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

function read(file) {
  return normalize(fs.readFileSync(file, "utf8"));
}

function splitFrontmatter(text, file) {
  if (!text.startsWith("---\n")) {
    fail(`${rel(file)}: missing frontmatter`);
    return null;
  }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    fail(`${rel(file)}: unterminated frontmatter`);
    return null;
  }
  return { frontmatter: text.slice(4, end), body: text.slice(end + 5) };
}

function listAgentIds(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort();
}

function listSkillIds() {
  if (!fs.existsSync(SKILLS)) return [];
  return fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(SKILLS, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

function extractSkillRefs(body) {
  const refs = new Set();
  for (const match of body.matchAll(/`([^`\n]+)`/g)) {
    refs.add(match[1].trim());
  }
  return refs;
}

const openIds = listAgentIds(OPEN_AGENTS);
const claudeIds = listAgentIds(CLAUDE_AGENTS);
const skillIds = listSkillIds();
const skillSet = new Set(skillIds);
const agentSet = new Set(openIds);

if (openIds.length === 0) fail(".opencode/agents: no agent definitions found");
if (claudeIds.length === 0) fail(".claude/agents: no agent definitions found");
if (skillIds.length === 0) fail(".claude/skills: no skills found");

for (const id of openIds) {
  if (!claudeIds.includes(id)) fail(`.claude/agents/${id}.md: missing mirror`);
}
for (const id of claudeIds) {
  if (!openIds.includes(id)) fail(`.opencode/agents/${id}.md: missing mirror`);
}

let primaryCount = 0;
const referencedSkills = new Set();

for (const id of openIds.filter((value) => claudeIds.includes(value))) {
  const openFile = path.join(OPEN_AGENTS, `${id}.md`);
  const claudeFile = path.join(CLAUDE_AGENTS, `${id}.md`);
  const open = splitFrontmatter(read(openFile), openFile);
  const claude = splitFrontmatter(read(claudeFile), claudeFile);
  if (!open || !claude) continue;

  if (open.body !== claude.body) fail(`agent ${id}: body mismatch between runtimes`);

  if (!/^description:\s*\S/m.test(open.frontmatter)) fail(`${rel(openFile)}: missing description`);
  const mode = open.frontmatter.match(/^mode:\s*(primary|subagent)\s*$/m);
  if (!mode) fail(`${rel(openFile)}: missing/invalid mode`);
  if (mode?.[1] === "primary") primaryCount += 1;

  if (!/^name:\s*\S/m.test(claude.frontmatter)) fail(`${rel(claudeFile)}: missing name`);
  if (!/^description:\s*\S/m.test(claude.frontmatter)) fail(`${rel(claudeFile)}: missing description`);
  if (!/^tools:\s*\S/m.test(claude.frontmatter)) fail(`${rel(claudeFile)}: missing tools`);
  if (!/^model:\s*\S/m.test(claude.frontmatter)) fail(`${rel(claudeFile)}: missing model`);
  const name = claude.frontmatter.match(/^name:\s*(\S+)\s*$/m);
  if (name && name[1] !== id) fail(`${rel(claudeFile)}: name=${name[1]} does not match filename`);

  for (const ref of extractSkillRefs(open.body)) {
    if (!SKILL_LIKE.test(ref) || agentSet.has(ref)) continue;
    if (!skillSet.has(ref)) {
      fail(`agent ${id}: references unknown skill ${ref}`);
    } else {
      referencedSkills.add(ref);
    }
  }

  if (id === REVIEWER_ID) {
    for (const action of ["edit", "shell", "subagent"]) {
      const deny = new RegExp(`- action: ${action}\\s+resource: "\\*"\\s+effect: deny`);
      if (!deny.test(open.frontmatter)) fail(`${rel(openFile)}: reviewer must deny ${action}`);
    }
    const tools = claude.frontmatter.match(/^tools:\s*(.+)$/m);
    if (tools && /\b(Write|Edit|Bash|Task)\b/.test(tools[1])) {
      fail(`${rel(claudeFile)}: reviewer tools must stay read-only`);
    }
  }

  notes.push(`agent ${id}: OK (${mode?.[1] ?? "unknown"})`);
}

if (primaryCount !== 1) fail(`expected exactly 1 primary agent, found ${primaryCount}`);

for (const id of skillIds) {
  const file = path.join(SKILLS, id, "SKILL.md");
  const parsed = splitFrontmatter(read(file), file);
  if (!parsed) continue;
  if (!/^name:\s*\S/m.test(parsed.frontmatter)) fail(`${rel(file)}: missing name`);
  if (!/^description:\s*\S/m.test(parsed.frontmatter)) fail(`${rel(file)}: missing description`);
  if (!parsed.body.trim()) fail(`${rel(file)}: empty body`);
  notes.push(`skill ${id}: OK`);
}

for (const id of skillIds) {
  if (!referencedSkills.has(id)) notes.push(`skill ${id}: not referenced by any agent`);
}

const scanRoots = [OPEN_AGENTS, CLAUDE_AGENTS, SKILLS];
for (const dir of scanRoots) {
  if (!fs.existsSync(dir)) continue;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        if (FORBIDDEN.test(read(full))) fail(`${rel(full)}: forbidden marker (secret/TODO)`);
      }
    }
  };
  walk(dir);
}

if (errors.length > 0) {
  console.error("FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`PASS agents=${openIds.length} skills=${skillIds.length} references=${referencedSkills.size}`);
for (const note of notes) console.log(`- ${note}`);
