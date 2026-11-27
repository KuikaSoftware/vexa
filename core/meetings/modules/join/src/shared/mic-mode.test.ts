/** VEXA_MIC_MODE parsing: anything but "open" keeps the default toggle behaviour. */
import { micMode } from "./mic-mode";

let failed = 0;
const check = (name: string, cond: boolean): void => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`);
  if (!cond) failed++;
};

check("unset → toggle", micMode({}) === "toggle");
check("open → open", micMode({ VEXA_MIC_MODE: "open" }) === "open");
check("case and spaces are ignored", micMode({ VEXA_MIC_MODE: " Open " }) === "open");
check("an unknown value → toggle", micMode({ VEXA_MIC_MODE: "always" }) === "toggle");

if (failed) { console.error(`mic-mode: ${failed} failed`); process.exit(1); }
console.log("mic-mode: all passed");
