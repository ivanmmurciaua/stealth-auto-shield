import chalk from "chalk";
import readline from "readline";
import ora, { Ora } from "ora";

export function printBanner(): void {
  console.log(
    chalk.cyan(`
╔══════════════════════════════════════════════════╗
║       🛡️  STEALTH RAILGUN CLI  •  v0.1.0  🛡️       ║
╚══════════════════════════════════════════════════╝
`),
  );
}

export function printOnlineBanner(): void {
  console.log(
    chalk.bgGreen.black.bold(`
   ██████╗ ███╗   ██╗██╗     ██╗███╗   ██╗███████╗    ███╗   ███╗ ██████╗ ██████╗ ███████╗
  ██╔═══██╗████╗  ██║██║     ██║████╗  ██║██╔════╝    ████╗ ████║██╔═══██╗██╔══██╗██╔════╝
  ██║   ██║██╔██╗ ██║██║     ██║██╔██╗ ██║█████╗      ██╔████╔██║██║   ██║██║  ██║█████╗
  ██║   ██║██║╚██╗██║██║     ██║██║╚██╗██║██╔══╝      ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝
  ╚██████╔╝██║ ╚████║███████╗██║██║ ╚████║███████╗    ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗
   ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝`),
  );
  console.log(
    chalk.green.bold("\n  CONNECT FROM THE INTERNET NOW BEFORE CONTINUING\n"),
  );
}

export function printOfflineBanner(): void {
  console.log(
    chalk.bgRed.white.bold(`
   ██████╗ ███████╗███████╗██╗     ██╗███╗   ██╗███████╗    ███╗   ███╗ ██████╗ ██████╗ ███████╗
  ██╔═══██╗██╔════╝██╔════╝██║     ██║████╗  ██║██╔════╝    ████╗ ████║██╔═══██╗██╔══██╗██╔════╝
  ██║   ██║█████╗  █████╗  ██║     ██║██╔██╗ ██║█████╗      ██╔████╔██║██║   ██║██║  ██║█████╗
  ██║   ██║██╔══╝  ██╔══╝  ██║     ██║██║╚██╗██║██╔══╝      ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝
  ╚██████╔╝██║     ██║     ███████╗██║██║ ╚████║███████╗    ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗
   ╚═════╝ ╚═╝     ╚═╝     ╚══════╝╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝`),
  );
  console.log(
    chalk.red.bold("\n  DISCONNECT FROM THE INTERNET NOW BEFORE CONTINUING\n"),
  );
}

export function printSection(title: string): void {
  console.log(
    chalk.yellow(
      `\n────────────────────────── ${title} ──────────────────────────`,
    ),
  );
}

export function printSuccess(msg: string): void {
  console.log(chalk.green(` ${msg}`));
}

export function printError(msg: string): void {
  console.log(chalk.red(`   ${msg}`));
}

export function printInfo(msg: string): void {
  console.log(chalk.gray(`  ${msg}`));
}

export function spinner(text: string): Ora {
  return ora({ text, color: "cyan" }).start();
}

export async function askSeedLength(): Promise<12 | 24> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const ask = () => {
      rl.question(
        chalk.yellow("  How many words does your seed have? (12/24): "),
        (answer) => {
          const n = parseInt(answer.trim(), 10);
          if (n === 12 || n === 24) {
            rl.close();
            resolve(n);
          } else {
            console.log(
              chalk.red("  Only 12 or 24 is accepted. Please try again"),
            );
            ask();
          }
        },
      );
    };
    ask();
  });
}

/**
 * Hidden prompt: the input is not displayed on the screen.
 * Ideal for seed phrases and private keys.
 */
export function hiddenPrompt(
  question: string,
  totalWords: number,
): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(chalk.yellow(`\n  ${question}\n`));
    process.stdout.write("  ");

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let input = "";

    const countWords = (text: string): number => {
      return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    };

    const updateCounter = () => {
      const wordCount = countWords(input);
      const remaining = Math.max(0, totalWords - wordCount);
      const filled = Math.min(wordCount, totalWords);
      const bar =
        chalk.green("█").repeat(filled) +
        chalk.gray("░").repeat(totalWords - filled);

      let status: string;
      if (wordCount === 0) {
        status = chalk.gray("Start typing...");
      } else if (wordCount < totalWords) {
        status = chalk.yellow(
          `You have ${wordCount} · You’re missing ${remaining}`,
        );
      } else if (wordCount === totalWords) {
        status = chalk.green(`¡${totalWords} words! Press Enter to confirm`);
      } else {
        status = chalk.red(`${wordCount} words (too many, please check)`);
      }

      process.stdout.write(`\r  ${bar}  ${status}  `);
    };

    updateCounter();

    const onData = (chunk: string) => {
      const enterIdx =
        chunk.indexOf("\r") !== -1 ? chunk.indexOf("\r") : chunk.indexOf("\n");

      if (enterIdx !== -1) {
        const before = chunk.slice(0, enterIdx);
        if (before.length > 0) input += before;

        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        updateCounter();
        process.stdout.write("\n");
        resolve(input.trim());
        return;
      }

      if (chunk === "\u0003") {
        // Ctrl+C
        process.stdout.write("\n");
        process.exit(0);
      } else if (chunk === "\u007f" || chunk === "\b") {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          updateCounter();
        }
      } else {
        // Normal char or paste block
        input += chunk;
        updateCounter();
      }
    };

    process.stdin.on("data", onData);
  });
}

export function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(chalk.yellow(`  ${question}: `), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
