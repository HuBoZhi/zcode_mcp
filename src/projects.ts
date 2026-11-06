/** Read the desktop's saved project catalogue without booting an agent. */
import { copyFile, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface DesktopProject {
  id: string;
  name: string;
  path: string;
  hostId: string;
  roots: { path: string; primary: boolean }[];
}

async function fingerprint(path: string): Promise<string | null> {
  try {
    const info = await stat(path, { bigint: true });
    return `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listDesktopProjects(options: { database?: string; tempDir?: string } = {}) {
  const database = resolve(options.database || process.env.ZCODE_PROJECTS_DB || join(homedir(), ".zcode/v2/tasks-index.sqlite"));
  const temporary = options.tempDir || process.env.ZCODE_MCP_STATE_DIR || tmpdir();
  if (!isAbsolute(temporary)) throw new Error("Project snapshot directory must be an absolute path");
  const actualTemporary = await realpath(temporary);
  if (/^C:[\\/]/i.test(actualTemporary)) throw new Error("Set ZCODE_MCP_STATE_DIR or TEMP to a non-C drive for project snapshots");
  if (!(await fingerprint(database))) throw new Error(`ZCode project database not found: ${database}. Set ZCODE_PROJECTS_DB to the desktop tasks-index.sqlite file`);
  // Import lazily: other MCP tools remain available on older Node versions.
  const { DatabaseSync } = await import("node:sqlite").catch(() => {
    throw new Error("zcode_projects requires Node 22.13+ (Node 24+ recommended)");
  });
  const scratch = await mkdtemp(join(actualTemporary, "zcode-projects-"));
  try {
    const snapshot = join(scratch, "projects.sqlite");
    let stable = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await Promise.all([fingerprint(database), fingerprint(database + "-wal")]);
      await rm(snapshot + "-wal", { force: true });
      await copyFile(database, snapshot);
      try {
        if (before[1] !== null) await copyFile(database + "-wal", snapshot + "-wal");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const after = await Promise.all([fingerprint(database), fingerprint(database + "-wal")]);
      if (JSON.stringify(before) === JSON.stringify(after)) { stable = true; break; }
    }
    if (!stable) throw new Error("ZCode project database changed during snapshot; retry when desktop activity settles");
    const db = new DatabaseSync(snapshot, { readOnly: true });
    try {
      let rows;
      try {
        rows = db.prepare(`SELECT p.project_id, p.name, p.host_id, r.root_path, r.is_primary
          FROM projects p JOIN project_roots r ON r.project_id = p.project_id
          WHERE p.deleted = 0 AND p.host_id = 'local'
          ORDER BY p.position, p.project_id, r.is_primary DESC, r.position, r.root_path`).all();
      } catch {
        throw new Error("Cannot read ZCode projects/project_roots schema; desktop version may be unsupported or the snapshot invalid");
      }
      const projects = new Map<string, DesktopProject>();
      for (const row of rows) {
        if (typeof row.project_id !== "string" || typeof row.root_path !== "string" || !row.root_path.trim()) continue;
        let project = projects.get(row.project_id);
        if (!project) {
          project = { id: row.project_id, name: String(row.name), path: row.root_path,
            hostId: String(row.host_id), roots: [] };
          projects.set(project.id, project);
        }
        project.roots.push({ path: row.root_path, primary: row.is_primary === 1 });
      }
      return { projects: [...projects.values()], source: { kind: "zcode-desktop-project-index", database } };
    } finally { db.close(); }
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
