#!/usr/bin/env node
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { ingestFacebookExport } from "./fb/ingest.js";
import { verifyPack } from "./verify.js";

function resolvePath(p: string) {
  return path.resolve(process.cwd(), p);
}

await yargs(hideBin(process.argv))
  .scriptName("memory-etl")
  .command(
    "ingest",
    "Ingest a Facebook export folder and produce a Memory Pack (manifest + store.sqlite + media_map.json).",
    (y: any) =>
      y
        .option("input", { type: "string", demandOption: true, describe: "Path to extracted Facebook export folder" })
        .option("out", {
          type: "string",
          demandOption: true,
          describe: "Output folder for the Memory Pack (will be created if missing)",
        })
        .option("force", { type: "boolean", default: false, describe: "Re-ingest all files even if unchanged" }),
    async (args: any) => {
      const input = resolvePath(args.input);
      const outDir = resolvePath(args.out);
      await ingestFacebookExport({ inputDir: input, outDir, force: args.force });
    }
  )
  .command(
    "verify",
    "Verify a Memory Pack's files + SQLite schema/FTS + vector index presence.",
    (y: any) =>
      y
        .option("pack", { type: "string", demandOption: true, describe: "Path to Memory Pack folder" })
        .option("token", { type: "string", default: "test", describe: "FTS token to query (names-only)" }),
    async (args: any) => {
      const out = await verifyPack({ packDir: resolvePath(args.pack), token: args.token });
      console.log(JSON.stringify(out, null, 2));
    }
  )
  .demandCommand(1)
  .strict()
  .help()
  .parseAsync();


