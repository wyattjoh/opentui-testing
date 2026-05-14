import { afterEach, describe, expect, test } from "bun:test";
import { useKeyboard } from "@opentui/react";
import { useState, type ReactNode } from "react";
import { tmpdir } from "node:os";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { MockInput } from "@opentui/core/testing";

import {
  applyCwd,
  applyEnv,
  flushFrames,
  keys,
  render,
  waitForFrame,
  wrapInput,
} from "../src/index.ts";

function Hello(): ReactNode {
  return (
    <box flexDirection="column" padding={1} border>
      <text>Hello, OpenTUI!</text>
    </box>
  );
}

function Counter(): ReactNode {
  const [count, setCount] = useState(0);
  useKeyboard((key) => {
    if (key.name === "up") setCount((c) => c + 1);
    if (key.name === "down") setCount((c) => c - 1);
  });
  return (
    <box flexDirection="column" padding={1} border>
      <text>Count: {count}</text>
    </box>
  );
}

function EnvDisplay(): ReactNode {
  return (
    <box flexDirection="column" padding={1} border>
      <text>MODE: {process.env.MODE ?? "unset"}</text>
    </box>
  );
}

function CwdDisplay(): ReactNode {
  return (
    <box flexDirection="column" padding={1} border>
      <text>CWD: {process.cwd()}</text>
    </box>
  );
}

function KeyLog(): ReactNode {
  const [count, setCount] = useState(0);
  const [last, setLast] = useState("none");
  useKeyboard((key) => {
    setCount((c) => c + 1);
    setLast(key.name ?? "?");
  });
  return (
    <box flexDirection="column" padding={1} border>
      <text>count: {count}</text>
      <text>last: {last}</text>
    </box>
  );
}

function ColorText(): ReactNode {
  return (
    <box flexDirection="column">
      <text fg="#ff0000">RED</text>
    </box>
  );
}

describe("render", () => {
  test("captures initial frame as snapshot", async () => {
    await using rendered = await render(<Hello />, { width: 30, height: 6 });
    expect(rendered.captureCharFrame()).toMatchSnapshot();
  });

  test("snapshots state after keyboard interaction", async () => {
    await using rendered = await render(<Counter />, { width: 30, height: 6 });
    const { input, captureCharFrame, waitForFrame } = rendered;

    expect(captureCharFrame()).toContain("Count: 0");

    await input.pressArrow("up");
    await input.pressArrow("up");
    await input.pressArrow("up");
    await waitForFrame((frame) => frame.includes("Count: 3"));

    expect(captureCharFrame()).toMatchSnapshot();
  });

  test("exposes the underlying renderer and mockMouse passthrough", async () => {
    await using rendered = await render(<Hello />, { width: 30, height: 6 });
    expect(rendered.renderer).toBeDefined();
    expect(typeof rendered.renderer.destroy).toBe("function");
    expect(rendered.mockMouse).toBeDefined();
    expect(typeof rendered.mockMouse.click).toBe("function");
    expect(typeof rendered.mockMouse.moveTo).toBe("function");
  });

  test("applies env overrides during render and restores them on dispose", async () => {
    process.env.MODE = "outer";

    {
      await using rendered = await render(<EnvDisplay />, {
        width: 30,
        height: 5,
        env: { MODE: "inner", FEATURE_FLAG: "1" },
      });

      expect(rendered.captureCharFrame()).toContain("MODE: inner");
      expect(process.env.MODE).toBe("inner");
      expect(process.env.FEATURE_FLAG).toBe("1");
    }

    expect(process.env.MODE).toBe("outer");
    expect(process.env.FEATURE_FLAG).toBeUndefined();

    delete process.env.MODE;
  });

  test("applies cwd override during render and restores it on dispose", async () => {
    const originalCwd = process.cwd();
    const tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "otui-render-cwd-")));

    try {
      {
        await using rendered = await render(<CwdDisplay />, {
          width: tmpDir.length + 20,
          height: 5,
          cwd: tmpDir,
        });

        expect(rendered.captureCharFrame()).toContain(`CWD: ${tmpDir}`);
        expect(process.cwd()).toBe(tmpDir);
      }

      expect(process.cwd()).toBe(originalCwd);
    } finally {
      if (process.cwd() !== originalCwd) process.chdir(originalCwd);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("[Symbol.asyncDispose] is callable directly for mid-scope cleanup", async () => {
    const rendered = await render(<Hello />, { width: 30, height: 6 });
    expect(typeof rendered[Symbol.asyncDispose]).toBe("function");
    await rendered[Symbol.asyncDispose]();
  });

  test("cleanup() destroys the renderer, restores env/cwd, and is idempotent", async () => {
    const originalCwd = process.cwd();
    const tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "otui-cleanup-")));
    process.env.MODE = "outer";

    try {
      const rendered = await render(<EnvDisplay />, {
        width: 30,
        height: 5,
        env: { MODE: "inner" },
        cwd: tmpDir,
      });

      expect(process.env.MODE).toBe("inner");
      expect(process.cwd()).toBe(tmpDir);

      await rendered.cleanup();

      expect(process.env.MODE).toBe("outer");
      expect(process.cwd()).toBe(originalCwd);

      await rendered.cleanup();
      await rendered[Symbol.asyncDispose]();

      expect(process.env.MODE).toBe("outer");
      expect(process.cwd()).toBe(originalCwd);
    } finally {
      if (process.cwd() !== originalCwd) process.chdir(originalCwd);
      delete process.env.MODE;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("input", () => {
  test("typeText fires one keypress per character", async () => {
    await using rendered = await render(<KeyLog />, { width: 30, height: 7 });
    const { input, captureCharFrame, waitForFrame } = rendered;

    await input.typeText("hi");
    await waitForFrame((frame) => frame.includes("count: 2"));

    expect(captureCharFrame()).toContain("count: 2");
  });

  test("pressKey(keys.RETURN) emits a return key", async () => {
    await using rendered = await render(<KeyLog />, { width: 30, height: 7 });
    const { input, captureCharFrame, waitForFrame } = rendered;

    await input.pressKey(keys.RETURN);
    await waitForFrame((frame) => frame.includes("last: return"));

    const frame = captureCharFrame();
    expect(frame).toContain("count: 1");
    expect(frame).toContain("last: return");
  });
});

describe("flushFrames", () => {
  test("bound form pumps n frames and keeps the renderer alive", async () => {
    await using rendered = await render(<Hello />, { width: 30, height: 6 });
    await rendered.flushFrames(3);
    expect(rendered.captureCharFrame()).toContain("Hello, OpenTUI!");
  });

  test("standalone form drives renderOnce from an existing renderer", async () => {
    await using rendered = await render(<Hello />, { width: 30, height: 6 });
    await flushFrames(rendered.renderOnce, 2);
    expect(rendered.captureCharFrame()).toContain("Hello, OpenTUI!");
  });
});

describe("waitForFrame", () => {
  test("standalone form pumps until predicate matches", async () => {
    await using rendered = await render(<Counter />, { width: 30, height: 6 });
    const frame = await waitForFrame(rendered.renderOnce, rendered.captureCharFrame, (f) =>
      f.includes("Count: 0"),
    );
    expect(frame).toContain("Count: 0");
  });

  test("throws with the last captured frame when predicate never matches", async () => {
    await using rendered = await render(<Hello />, { width: 30, height: 6 });

    await expect(
      rendered.waitForFrame((frame) => frame.includes("not present"), {
        timeoutMs: 50,
        maxFrames: 4,
      }),
    ).rejects.toThrow(/predicate did not match.*Hello, OpenTUI!/s);
  });
});

describe("resize", () => {
  test("resize shrinks the captured frame dimensions", async () => {
    await using rendered = await render(<Hello />, { width: 80, height: 24 });
    const { resize, captureCharFrame, waitForFrame } = rendered;

    const beforeWidth = captureCharFrame().split("\n")[0]!.length;
    expect(beforeWidth).toBeGreaterThanOrEqual(80);

    resize(30, 6);
    await waitForFrame(
      (frame) =>
        frame.split("\n")[0]!.length < beforeWidth && frame.includes("Hello, OpenTUI!"),
    );

    const after = captureCharFrame();
    expect(after.split("\n")[0]!.length).toBeLessThanOrEqual(30);
    expect(after).toContain("Hello, OpenTUI!");
  });
});

describe("captureSpans", () => {
  test("returns per-cell color information for styled text", async () => {
    await using rendered = await render(<ColorText />, { width: 10, height: 3 });

    const frame = rendered.captureSpans();
    expect(frame.cols).toBe(10);
    expect(frame.rows).toBe(3);
    expect(frame.lines.length).toBe(3);

    const redSpan = frame.lines
      .flatMap((line) => line.spans)
      .find((span) => span.text === "RED");

    expect(redSpan).toBeDefined();
    expect(redSpan!.fg.r).toBeGreaterThan(0.9);
    expect(redSpan!.fg.g).toBeLessThan(0.1);
    expect(redSpan!.fg.b).toBeLessThan(0.1);
  });
});

describe("keys", () => {
  test("re-exports KeyCodes plus SPACE alias", () => {
    expect(keys.ARROW_UP).toBe("\x1B[A");
    expect(keys.RETURN).toBe("\r");
    expect(keys.SPACE).toBe(" ");
  });
});

describe("wrapInput", () => {
  test("wraps function fields as async and passes return values through", async () => {
    const calls: unknown[][] = [];
    const stub = {
      pressKey: (...args: unknown[]) => {
        calls.push(args);
        return "ok";
      },
      label: "raw",
    };

    const wrapped = wrapInput(stub as unknown as MockInput);

    const result = await (wrapped as unknown as {
      pressKey: (s: string) => Promise<string>;
    }).pressKey("\r");

    expect(result).toBe("ok");
    expect(calls).toEqual([["\r"]]);
    expect((wrapped as unknown as { label: string }).label).toBe("raw");
  });
});

describe("applyEnv", () => {
  afterEach(() => {
    delete process.env.OT_AAA;
    delete process.env.OT_BBB;
    delete process.env.OT_CCC;
  });

  test("applies overrides, unsets on undefined, and restores prior state", () => {
    const read = (key: string): string | undefined => process.env[key];
    process.env.OT_AAA = "before";
    delete process.env.OT_BBB;
    process.env.OT_CCC = "preserve";

    const restore = applyEnv({ OT_AAA: "after", OT_BBB: "new", OT_CCC: undefined });

    expect(read("OT_AAA")).toBe("after");
    expect(read("OT_BBB")).toBe("new");
    expect(read("OT_CCC")).toBeUndefined();

    restore();

    expect(read("OT_AAA")).toBe("before");
    expect(read("OT_BBB")).toBeUndefined();
    expect(read("OT_CCC")).toBe("preserve");
  });
});

describe("applyCwd", () => {
  test("switches process.cwd() and restores it on the returned callback", () => {
    const originalCwd = process.cwd();
    const tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "otui-apply-cwd-")));

    try {
      const restore = applyCwd(tmpDir);
      expect(process.cwd()).toBe(tmpDir);

      restore();
      expect(process.cwd()).toBe(originalCwd);
    } finally {
      if (process.cwd() !== originalCwd) process.chdir(originalCwd);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
