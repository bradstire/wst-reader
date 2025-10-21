import { readFileSync } from "fs";
import { join } from "path";

const angelCoreV5_1_6 = readFileSync(
  join(process.cwd(), "lib", "prompts", "angelCoreV5_1_6.txt"),
  "utf-8"
);

export default angelCoreV5_1_6;

