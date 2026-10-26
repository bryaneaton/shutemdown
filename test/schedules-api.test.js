import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const serverEntry = path.join(projectRoot, "server/index.js");

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startServer() {
  const directory = await mkdtemp(path.join("/tmp", "shutemdown-test-"));
  const configDirectory = path.join(directory, "config");
  await mkdir(configDirectory);
  await writeFile(
    path.join(configDirectory, "server.yaml"),
    "server:\n  port: 0\nsecurity:\n  wordOfDay: test-word\nunifi:\n  enabled: false\n",
  );
  await writeFile(
    path.join(configDirectory, "devices.json"),
    JSON.stringify([{ macAddress: "AA:BB:CC:DD:EE:FF", groupName: "Alexis" }]),
  );

  const port = await availablePort();
  const child = spawn(process.execPath, [serverEntry], {
    cwd: directory,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/schedules`);
      if (response.ok) {
        return {
          child,
          directory,
          baseUrl: `http://127.0.0.1:${port}`,
        };
      }
    } catch {
      // Wait for the server to finish starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  child.kill();
  await rm(directory, { recursive: true, force: true });
  throw new Error(`Server did not start: ${output.join("")}`);
}

async function stopServer(server) {
  server.child.kill();
  await once(server.child, "exit");
  await rm(server.directory, { recursive: true, force: true });
}

test("schedule API creates, replaces, lists, and deletes a schedule", async () => {
  const server = await startServer();

  try {
    const createResponse = await fetch(`${server.baseUrl}/api/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        groupName: "Alexis",
        offTime: "21:00",
        onTime: "07:00",
        days: [1, 2, 3, 4, 5],
      }),
    });
    const created = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(created.schedules.length, 1);
    assert.equal(created.schedule.groupName, "Alexis");
    assert.equal(created.schedule.enabled, true);

    const replaceResponse = await fetch(`${server.baseUrl}/api/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        groupName: "alexis",
        offTime: "22:00",
        onTime: "06:30",
        days: [1, 3, 5],
      }),
    });
    const replaced = await replaceResponse.json();

    assert.equal(replaceResponse.status, 200);
    assert.equal(replaced.schedules.length, 1);
    assert.equal(replaced.schedule.id, created.schedule.id);
    assert.equal(replaced.schedule.offTime, "22:00");

    const deleteResponse = await fetch(
      `${server.baseUrl}/api/schedules/${created.schedule.id}`,
      { method: "DELETE" },
    );
    const deleted = await deleteResponse.json();

    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(deleted.schedules, []);
  } finally {
    await stopServer(server);
  }
});

test("device changes require the configured word of the day", async () => {
  const server = await startServer();

  try {
    const missingWordResponse = await fetch(`${server.baseUrl}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ macAddress: "11:22:33:44:55:66" }),
    });
    assert.equal(missingWordResponse.status, 403);

    const validWordResponse = await fetch(`${server.baseUrl}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        macAddress: "11:22:33:44:55:66",
        wordOfDay: " TEST-WORD ",
      }),
    });
    assert.equal(validWordResponse.status, 201);
  } finally {
    await stopServer(server);
  }
});
