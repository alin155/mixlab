#!/usr/bin/env node
/**
 * MixLab product version bump (no external dependencies, no npm/git writes).
 *
 * - Reads only package.json version files of the requested product(s).
 * - Pure semver validation and patch/minor/major bump.
 * - Dry-run by default; --write persists to disk.
 * - contracts / library-format are additive-only: major bumps require --allow-breaking.
 *
 * Products:
 *   admin          -> apps/admin-web, packages/admin-api (mixlab repo)
 *   cutter         -> apps/cutter-web, apps/cutter-desktop (cutter repo)
 *   smart          -> apps/smart-cutter-web, apps/smart-cutter-desktop (smart-cutter repo)
 *   contracts      -> packages/contracts (mixlab repo)
 *   library-format -> packages/library-format (mixlab repo)
 *   service-clients-> packages/service-clients (mixlab repo)
 *   all            -> every product above (missing products are skipped with a warning)
 *
 * This script never calls npm, never runs git commands and never publishes.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCT_NAMES = [
  "admin",
  "cutter",
  "smart",
  "contracts",
  "library-format",
  "service-clients"
];

export const BUMP_KINDS = ["patch", "minor", "major"];

export const DEFAULT_REPO_PATHS = {
  mixlab: path.resolve(import.meta.dirname, "..", ".."),
  cutter: "/Users/huaqihang/Documents/mixlab-cutter",
  "smart-cutter": "/Users/huaqihang/Documents/Codex/implementations/mixlab-smart-cutter"
};

export const PRODUCT_TARGETS = {
  admin: [
    { repo: "mixlab", file: "apps/admin-web/package.json", label: "admin-web", allow_major: true },
    { repo: "mixlab", file: "packages/admin-api/package.json", label: "admin-api", allow_major: true }
  ],
  cutter: [
    { repo: "cutter", file: "apps/cutter-web/package.json", label: "cutter-web", allow_major: true },
    { repo: "cutter", file: "apps/cutter-desktop/package.json", label: "cutter-desktop", allow_major: true }
  ],
  smart: [
    { repo: "smart-cutter", file: "apps/smart-cutter-web/package.json", label: "smart-cutter-web", allow_major: true },
    { repo: "smart-cutter", file: "apps/smart-cutter-desktop/package.json", label: "smart-cutter-desktop", allow_major: true }
  ],
  contracts: [
    { repo: "mixlab", file: "packages/contracts/package.json", label: "contracts", allow_major: false }
  ],
  "library-format": [
    { repo: "mixlab", file: "packages/library-format/package.json", label: "library-format", allow_major: false }
  ],
  "service-clients": [
    { repo: "mixlab", file: "packages/service-clients/package.json", label: "service-clients", allow_major: true }
  ]
};

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function resolveRepoPaths(overrides = {}, env = process.env) {
  return {
    mixlab: overrides.mixlab || env.MIXLAB_REPO || DEFAULT_REPO_PATHS.mixlab,
    cutter: overrides.cutter || env.MIXLAB_CUTTER_REPO || DEFAULT_REPO_PATHS.cutter,
    "smart-cutter": overrides["smart-cutter"] || env.MIXLAB_SMART_REPO || DEFAULT_REPO_PATHS["smart-cutter"]
  };
}

export function parseSemver(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = SEMVER_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] || "",
    raw: value.trim()
  };
}

export function isValidSemver(value) {
  return parseSemver(value) !== null;
}

export function bumpSemverVersion(value, bump) {
  const parsed = parseSemver(value);
  if (!parsed) {
    throw new Error("invalid semver: " + String(value));
  }

  if (!BUMP_KINDS.includes(bump)) {
    throw new Error("invalid bump kind: " + String(bump));
  }

  if (bump === "major") {
    return String(parsed.major + 1) + ".0.0";
  }
  if (bump === "minor") {
    return String(parsed.major) + "." + String(parsed.minor + 1) + ".0";
  }
  return String(parsed.major) + "." + String(parsed.minor) + "." + String(parsed.patch + 1);
}

function readPackageJson(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return { raw, json: JSON.parse(raw) };
}

export function buildVersionPlan(input) {
  const product = input.product;
  const bump = input.bump;
  const repoPaths = resolveRepoPaths(input.repoPaths || {}, input.env || process.env);
  const allowBreaking = input.allowBreaking === true;
  const errors = [];
  const warnings = [];
  const entries = [];
  const skipped = [];

  if (!PRODUCT_NAMES.includes(product) && product !== "all") {
    errors.push("unknown product: " + String(product) + " (expected " + PRODUCT_NAMES.join("|") + "|all)");
  }
  if (!BUMP_KINDS.includes(bump)) {
    errors.push("unknown bump: " + String(bump) + " (expected " + BUMP_KINDS.join("|") + ")");
  }
  if (errors.length > 0) {
    return { ok: false, product, bump, entries, skipped, errors, warnings };
  }

  const productNames = product === "all" ? PRODUCT_NAMES : [product];

  for (const productName of productNames) {
    const targets = PRODUCT_TARGETS[productName] || [];
    let productResolved = false;

    for (const target of targets) {
      const repoRoot = repoPaths[target.repo];
      const absolutePath = path.join(repoRoot, target.file);

      if (!existsSync(absolutePath)) {
        if (product === "all") {
          skipped.push({ product: productName, repo: target.repo, file: target.file, reason: "file not found" });
          warnings.push(productName + ": skipped " + target.label + " (" + target.file + " not found in " + target.repo + ")");
          continue;
        }

        errors.push(productName + ": version file not found: " + target.file + " (repo " + target.repo + ")");
        continue;
      }

      productResolved = true;
      let packageJson;

      try {
        packageJson = readPackageJson(absolutePath).json;
      } catch (error) {
        errors.push(productName + ": cannot parse " + target.file + ": " + (error instanceof Error ? error.message : String(error)));
        continue;
      }

      const before = typeof packageJson.version === "string" ? packageJson.version : "";
      if (!isValidSemver(before)) {
        errors.push(productName + ": invalid semver in " + target.file + ": " + JSON.stringify(before));
        continue;
      }

      if (bump === "major" && target.allow_major === false && !allowBreaking) {
        errors.push(
          productName + ": " + target.label + " is additive-only; major bump requires --allow-breaking after a separate contract review"
        );
        continue;
      }

      entries.push({
        product: productName,
        label: target.label,
        repo: target.repo,
        repo_root: repoRoot,
        file: target.file,
        absolute_path: absolutePath,
        package_name: typeof packageJson.name === "string" ? packageJson.name : "",
        before,
        after: bumpSemverVersion(before, bump),
        bump
      });
    }

    if (product !== "all" && !productResolved && targets.length > 0) {
      warnings.push(productName + ": no version files were found");
    }
  }

  return {
    ok: errors.length === 0,
    product,
    bump,
    entries,
    skipped,
    errors,
    warnings
  };
}

export function writeVersionPlan(plan) {
  if (!plan.ok) {
    throw new Error("refusing to write an invalid version plan");
  }

  const written = [];

  for (const entry of plan.entries) {
    const current = readPackageJson(entry.absolute_path);

    if (current.json.version !== entry.before) {
      throw new Error(
        "version changed while planning: " + entry.file + " expected " + entry.before + " found " + String(current.json.version)
      );
    }

    const next = { ...current.json, version: entry.after };
    writeFileSync(entry.absolute_path, JSON.stringify(next, null, 2) + "\n", "utf8");
    written.push({ ...entry });
  }

  return written;
}

export function renderPlanText(plan, options = {}) {
  const lines = [];
  lines.push("MixLab version bump plan (" + (options.write ? "write" : "dry-run") + ")");
  lines.push("product: " + plan.product + ", bump: " + plan.bump);
  lines.push("");

  if (plan.entries.length === 0) {
    lines.push("(no version files to update)");
  } else {
    lines.push("product                 file                                        before -> after");
    for (const entry of plan.entries) {
      lines.push(
        entry.product.padEnd(23) + " " + (entry.file + " (" + entry.label + ")").padEnd(43) + " " + entry.before + " -> " + entry.after
      );
    }
  }

  if (plan.skipped.length > 0) {
    lines.push("");
    lines.push("skipped:");
    for (const skipped of plan.skipped) {
      lines.push("- " + skipped.product + ": " + skipped.file + " (" + skipped.reason + ")");
    }
  }

  if (plan.warnings.length > 0) {
    lines.push("");
    for (const warning of plan.warnings) {
      lines.push("WARN " + warning);
    }
  }

  if (plan.errors.length > 0) {
    lines.push("");
    for (const error of plan.errors) {
      lines.push("ERROR " + error);
    }
  }

  lines.push("");
  if (!options.write) {
    lines.push("[dry-run] no files written; pass --write to persist.");
  } else {
    lines.push("version files written. Next: update scripts/release/versions.json expected versions, then run:");
    lines.push("  npm run release:check");
    lines.push("  npm run release:manifest -- --out-dir dist/release");
    lines.push("  npm run release:changelog -- --since \"7 days ago\" --out dist/release/changelog.md");
  }

  return lines.join("\n") + "\n";
}

export function parseCliArgs(argv) {
  const args = {
    product: "",
    bump: "",
    write: false,
    dryRun: true,
    allowBreaking: false,
    json: false,
    listProducts: false,
    help: false,
    repoPaths: {}
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case "--product":
        args.product = next || "";
        index += 1;
        break;
      case "--bump":
        args.bump = next || "";
        index += 1;
        break;
      case "--write":
        args.write = true;
        args.dryRun = false;
        break;
      case "--dry-run":
        args.dryRun = true;
        args.write = false;
        break;
      case "--allow-breaking":
        args.allowBreaking = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--list-products":
        args.listProducts = true;
        break;
      case "--repo-mixlab":
        args.repoPaths.mixlab = next || "";
        index += 1;
        break;
      case "--repo-cutter":
        args.repoPaths.cutter = next || "";
        index += 1;
        break;
      case "--repo-smart-cutter":
        args.repoPaths["smart-cutter"] = next || "";
        index += 1;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error("unknown argument: " + current);
    }
  }

  return args;
}

function printHelp() {
  console.log("MixLab product version bump (no external dependencies; no npm/git writes)");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/release/version-bump.mjs --product admin --bump patch --dry-run");
  console.log("  node scripts/release/version-bump.mjs --product contracts --bump minor --dry-run");
  console.log("  node scripts/release/version-bump.mjs --product all --bump patch --write");
  console.log("");
  console.log("Options:");
  console.log("  --product <" + PRODUCT_NAMES.join("|") + "|all>");
  console.log("  --bump <" + BUMP_KINDS.join("|") + ">");
  console.log("  --dry-run        default; print before/after and write nothing");
  console.log("  --write          persist version changes to package.json files");
  console.log("  --allow-breaking required for major bumps of contracts / library-format (additive-only)");
  console.log("  --repo-mixlab/--repo-cutter/--repo-smart-cutter override repo roots");
  console.log("  --json           print the plan as JSON");
  console.log("  --list-products  print product -> version files mapping");
  console.log("");
  console.log("Product mapping:");
  for (const productName of PRODUCT_NAMES) {
    const targets = PRODUCT_TARGETS[productName].map((target) => target.repo + ":" + target.file).join(", ");
    console.log("  " + productName.padEnd(16) + targets);
  }
}

export function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);

  if (args.help) {
    printHelp();
    return 0;
  }

  if (args.listProducts) {
    const rows = PRODUCT_NAMES.map((productName) => ({
      product: productName,
      files: PRODUCT_TARGETS[productName].map((target) => target.repo + ":" + target.file)
    }));
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  if (!args.product || !args.bump) {
    console.error("version-bump: --product and --bump are required (or use --list-products/--help)");
    return 1;
  }

  const plan = buildVersionPlan({
    product: args.product,
    bump: args.bump,
    allowBreaking: args.allowBreaking,
    repoPaths: args.repoPaths,
    env: process.env
  });

  if (args.json) {
    const sanitized = {
      ...plan,
      entries: plan.entries.map((entry) => {
        const { absolute_path, repo_root, ...rest } = entry;
        return rest;
      })
    };
    process.stdout.write(JSON.stringify(sanitized, null, 2) + "\n");
  } else {
    process.stdout.write(renderPlanText(plan, { write: args.write }));
  }

  if (!plan.ok) {
    return 1;
  }

  if (args.write) {
    const written = writeVersionPlan(plan);
    for (const entry of written) {
      console.log("wrote " + entry.file + ": " + entry.before + " -> " + entry.after);
    }
  }

  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error("version-bump failed: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

