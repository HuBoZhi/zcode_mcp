import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, readdir, readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { listDesktopProjects } from "../dist/projects.js";

async function fixture(run) {
  assert.doesNotMatch(tmpdir(), /^C:[\\/]/i);
  const root = await mkdtemp(join(tmpdir(), "project-test-"));
  const database = join(root, "index.sqlite"), tempDir = join(root, "snapshots");
  await mkdir(tempDir);
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE projects(project_id TEXT PRIMARY KEY, name TEXT, host_id TEXT, deleted INTEGER, position INTEGER);
    CREATE TABLE project_roots(project_id TEXT, root_path TEXT, is_primary INTEGER, position INTEGER);
    INSERT INTO projects VALUES ('saved','正式项目','local',0,0),('deleted','已删除','local',1,1),('remote','远程','remote-host',0,2),('empty','无根目录','local',0,3);
    INSERT INTO project_roots VALUES ('saved','G:\\Secondary',0,0),('saved','G:\\Main',1,1),('deleted','G:\\Deleted',1,0),('remote','/remote',1,0);`);
  try { await run({ root, database, tempDir, db }); }
  finally { db.close(); await rm(root, { recursive: true, force: true }); }
}

test("reads committed WAL projects, filters deleted/remote, preserves ids and all roots", async () => {
  await fixture(async ({ database, tempDir }) => {
    const result = await listDesktopProjects({ database, tempDir });
    assert.deepEqual(result.projects, [{ id: "saved", name: "正式项目", hostId: "local", path: "G:\\Main",
      roots: [{ path: "G:\\Main", primary: true }, { path: "G:\\Secondary", primary: false }] }]);
    assert.equal(result.source.database, database);
    assert.deepEqual(await readdir(tempDir), []);
  });
});

test("does not change source DB/WAL contents or directory entries", async () => {
  await fixture(async ({ database, tempDir, root }) => {
    const before = await Promise.all([readFile(database), readFile(database + "-wal"), readdir(root)]);
    await listDesktopProjects({ database, tempDir });
    const after = await Promise.all([readFile(database), readFile(database + "-wal"), readdir(root)]);
    assert.deepEqual(after, before);
  });
});

test("reports missing and incompatible databases, cleans failed snapshots", async () => {
  await fixture(async ({ database, tempDir, db }) => {
    await assert.rejects(listDesktopProjects({ database: database + "-missing", tempDir }), /not found/);
    db.exec("DROP TABLE project_roots");
    await assert.rejects(listDesktopProjects({ database, tempDir }), /schema/);
    assert.deepEqual(await readdir(tempDir), []);
  });
});

test("empty catalogue is successful and does not invent projects from sessions", async () => {
  await fixture(async ({ database, tempDir, db }) => {
    db.exec("DELETE FROM projects");
    assert.deepEqual((await listDesktopProjects({ database, tempDir })).projects, []);
  });
});

test("MCP advertises and calls zcode_projects without an installed app-server", async () => {
  await fixture(async ({ database, tempDir }) => {
    const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"],
      env: { ...process.env, ZCODE_PROJECTS_DB: database, ZCODE_MCP_STATE_DIR: tempDir, ZCODE_BIN: "nonexistent.cjs" } });
    const client = new Client({ name: "project-test", version: "1" });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.equal(tools.tools.find(t => t.name === "zcode_projects").annotations.readOnlyHint, true);
      const result = await client.callTool({ name: "zcode_projects", arguments: {} });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.projects[0].id, "saved");
      assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    } finally { await client.close(); }
    assert.deepEqual(await readdir(tempDir), []);
  });
});

test("rejects snapshot directories whose junction resolves to C", { skip: process.platform !== "win32" }, async () => {
  await fixture(async ({ root, database }) => {
    const link = join(root, "c-junction");
    await symlink("C:\\Windows", link, "junction");
    await assert.rejects(listDesktopProjects({ database, tempDir: link }), /non-C drive/);
    // Unlink only our junction, never traverse its target during fixture cleanup.
    await rm(link);
  });
});
