import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginId = "mapx";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const obsidianConfigPath = join(homedir(), "Library/Application Support/obsidian/obsidian.json");

function readVaultPaths() {
	if (!existsSync(obsidianConfigPath)) {
		return [];
	}

	const config = JSON.parse(readFileSync(obsidianConfigPath, "utf8"));
	return Object.values(config.vaults ?? {})
		.map((vault) => vault.path)
		.filter((vaultPath) => typeof vaultPath === "string" && vaultPath.length > 0);
}

function linkPluginToVault(vaultPath) {
	const pluginsDirectory = join(vaultPath, ".obsidian/plugins");
	const pluginLinkPath = join(pluginsDirectory, pluginId);

	mkdirSync(pluginsDirectory, { recursive: true });

	if (existsSync(pluginLinkPath)) {
		const pluginPathStat = lstatSync(pluginLinkPath);
		if (pluginPathStat.isSymbolicLink()) {
			const currentTarget = resolve(dirname(pluginLinkPath), readlinkSync(pluginLinkPath));
			if (currentTarget === repoRoot) {
				console.log(`Already linked: ${pluginLinkPath} -> ${repoRoot}`);
				return;
			}

			rmSync(pluginLinkPath);
		} else if (pluginPathStat.isDirectory()) {
			const backupPath = `${pluginLinkPath}.backup-${Date.now()}`;
			cpSync(pluginLinkPath, backupPath, { recursive: true });
			rmSync(pluginLinkPath, { recursive: true, force: true });
			console.log(`Backed up existing plugin folder to ${backupPath}`);
		} else {
			rmSync(pluginLinkPath);
		}
	}

	symlinkSync(repoRoot, pluginLinkPath);
	console.log(`Linked ${pluginLinkPath} -> ${repoRoot}`);
}

const vaultPaths = readVaultPaths();

if (vaultPaths.length === 0) {
	console.error("No Obsidian vaults found in obsidian.json.");
	process.exit(1);
}

for (const vaultPath of vaultPaths) {
	linkPluginToVault(vaultPath);
}
