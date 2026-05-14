import { describe, expect, test } from "bun:test";
import { useKeyboard } from "@opentui/react";
import { useState, type ReactElement } from "react";

import { keys, render } from "../src/index.ts";

function Hello(): ReactElement {
  return (
    <box flexDirection="column" padding={1} border>
      <text>Hello, OpenTUI!</text>
    </box>
  );
}

function Counter(): ReactElement {
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

function EnvDisplay(): ReactElement {
  return (
    <box flexDirection="column" padding={1} border>
      <text>MODE: {process.env.MODE ?? "unset"}</text>
    </box>
  );
}

describe("render", () => {
  test("captures initial frame as snapshot", async () => {
    const { captureCharFrame, cleanup } = await render(<Hello />, { width: 30, height: 6 });
    expect(captureCharFrame()).toMatchSnapshot();
    await cleanup();
  });

  test("snapshots state after keyboard interaction", async () => {
    const { input, captureCharFrame, waitForFrame, cleanup } = await render(<Counter />, {
      width: 30,
      height: 6,
    });

    expect(captureCharFrame()).toContain("Count: 0");

    await input.pressArrow("up");
    await input.pressArrow("up");
    await input.pressArrow("up");
    await waitForFrame((frame) => frame.includes("Count: 3"));

    expect(captureCharFrame()).toMatchSnapshot();
    await cleanup();
  });

  test("keys constants are exported", () => {
    expect(keys.ARROW_UP).toBe("\x1B[A");
    expect(keys.SPACE).toBe(" ");
    expect(keys.RETURN).toBe("\r");
  });

  test("applies env overrides during render and restores them on cleanup", async () => {
    process.env.MODE = "outer";

    const { captureCharFrame, cleanup } = await render(<EnvDisplay />, {
      width: 30,
      height: 5,
      env: { MODE: "inner", FEATURE_FLAG: "1" },
    });

    expect(captureCharFrame()).toContain("MODE: inner");
    expect(process.env.MODE).toBe("inner");
    expect(process.env.FEATURE_FLAG).toBe("1");

    await cleanup();

    expect(process.env.MODE).toBe("outer");
    expect(process.env.FEATURE_FLAG).toBeUndefined();

    delete process.env.MODE;
  });
});
