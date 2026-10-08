import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { listCutterUsers } from "./cutter-users.ts";

export type CutterAccountTier = "ordinary" | "pro";
export function cutterEntitlementsPath(root: string): string {
  return path.join(root, ".mixlab-library", "cutter-users", "entitlements.json");
}
export async function readCutterEntitlements(root: string): Promise<Record<string, CutterAccountTier>> {
  let text: string;
  try { text = await readFile(cutterEntitlementsPath(root), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  const value = JSON.parse(text) as { schema_version: string; accounts: Record<string, CutterAccountTier> };
  if (value.schema_version !== "1.0" || !value.accounts || Array.isArray(value.accounts) || typeof value.accounts !== "object" ||
    Object.entries(value.accounts).some(([id, tier]) => !/^CU\d+$/.test(id) || !["ordinary", "pro"].includes(tier))) throw new Error("账号授权记录不可读取");
  return value.accounts;
}
export async function cutterAccountTier(root: string, userId: string): Promise<CutterAccountTier> {
  return (await readCutterEntitlements(root))[userId] ?? "ordinary";
}
let mutations: Promise<unknown> = Promise.resolve();
export async function setCutterAccountTier(root: string, userId: string, tier: CutterAccountTier): Promise<void> {
  if (!["ordinary", "pro"].includes(tier)) throw new Error("账号级别必须是 ordinary 或 pro");
  const action = mutations.then(async () => {
    const { users } = await listCutterUsers(root);
    if (!users.some(user => user.user_id === userId && user.status === "approved")) throw new Error("只能调整已审核账号的级别");
    const accounts = await readCutterEntitlements(root); accounts[userId] = tier;
    const file = cutterEntitlementsPath(root), temp = `${file}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(temp, JSON.stringify({ schema_version: "1.0", accounts }, null, 2), { mode: 0o600 });
    await rename(temp, file);
  });
  mutations = action.catch(() => undefined); return action;
}

export async function listCutterUsersWithTiers(root: string) {
  const [{ users }, tiers] = await Promise.all([listCutterUsers(root), readCutterEntitlements(root)]);
  return { users: users.map(user => ({ ...user, tier: tiers[user.user_id] ?? "ordinary" as CutterAccountTier })) };
}
