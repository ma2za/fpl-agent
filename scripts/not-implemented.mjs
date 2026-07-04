const command = process.argv[2] ?? "command";
const allowOk = process.argv.includes("--ok");

const message = `${command} is not implemented in Milestone 1.`;

if (allowOk) {
  console.log(message);
  process.exit(0);
}

console.error(message);
process.exit(1);
