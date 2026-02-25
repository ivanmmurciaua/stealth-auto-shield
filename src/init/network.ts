import { spinner } from "../ui/console.js";
import chalk from "chalk";

interface ModeType {
  type: "offline" | "online";
}

const CHECK_URLS = [
  "https://cloudflare.com",
  "https://google.com",
  "https://1.1.1.1",
];

const TIMEOUT_MS = 3000;

export async function hasInternet(): Promise<boolean> {
  const checks = CHECK_URLS.map(async (url) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      await fetch(url, { method: "HEAD", signal: controller.signal });
      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  });

  const results = await Promise.allSettled(checks);
  return results.some((r) => r.status === "fulfilled" && r.value === true);
}

export async function waitUntil(mode: ModeType): Promise<void> {
  const spin = spinner("Checking connection...");
  while (true) {
    const online = await hasInternet();
    if (mode.type === "online") {
      if (online) {
        spin.succeed(
          chalk.green("Connection detected - Online mode activated"),
        );
        return;
      }

      spin.text = chalk.yellow(
        "There's still no connection.... connect the WiFi/cable and wait",
      );
    } else {
      if (!online) {
        spin.succeed(
          chalk.green("No connection detected - Offline mode activated"),
        );
        return;
      }

      spin.text = chalk.yellow(
        "There's still a connection... disconnect the WiFi/cable and wait",
      );
    }
    await sleep(3);
  }
}

function sleep(s: number): Promise<void> {
  return new Promise((r) => setTimeout(r, s * 1000));
}
