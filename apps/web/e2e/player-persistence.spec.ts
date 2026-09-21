import { test, expect } from "@playwright/test";
import { createUser, adminUser, loginViaUI } from "./helpers/auth";
import { seedAudiobook } from "./helpers/seed";

// Generated silence: redistributable fixture, no private media or library paths.
function silentWav() {
  const sampleRate = 8000;
  const bytes = sampleRate * 120 * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + bytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(bytes, 40);
  return wav;
}

test("real player persists absolute position through authenticated PATCH and retries rejected saves", async ({
  page,
  browser,
}) => {
  await createUser(adminUser);
  const book = await seedAudiobook({
    title: "Continuity fixture",
    duration: 7200,
  });
  await page.addInitScript(() => {
    const Original = window.Audio;
    window.Audio = function (src?: string) {
      const audio = new Original(src);
      (window as unknown as { fixtureAudio: HTMLAudioElement }).fixtureAudio =
        audio;
      return audio;
    } as unknown as typeof Audio;
  });
  await page.route(`**/api/audiobooks/${book.id}/stream?*`, async (route) => {
    const wav = silentWav();
    const match = /bytes=(\d+)-(\d*)/.exec(
      route.request().headers()["range"] ?? "",
    );
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : wav.length - 1;
    await route.fulfill({
      status: match ? 206 : 200,
      contentType: "audio/wav",
      headers: {
        "X-File-Start-Position": "3600",
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        ...(match
          ? { "Content-Range": `bytes ${start}-${end}/${wav.length}` }
          : {}),
      },
      body:
        route.request().method() === "HEAD"
          ? undefined
          : wav.subarray(start, end + 1),
    });
  });
  await loginViaUI(page, adminUser.email, adminUser.password);
  const initial = await page.request.patch(`/api/progress/${book.id}`, {
    data: { position: 3610 },
  });
  expect(initial.ok()).toBeTruthy();
  const wrongOwner = await page.request.patch(`/api/progress/${book.id}`, {
    headers: { "X-Bookmark-User": "another-account" },
    data: { position: 0 },
  });
  expect(wrongOwner.status()).toBe(403);
  const anonymous = await browser.newContext();
  const unauthorized = await anonymous.request.patch(
    new URL(`/api/progress/${book.id}`, page.url()).href,
    { data: { position: 0 } },
  );
  expect(unauthorized.status()).toBe(401);
  await anonymous.close();
  await page.goto(`/audiobooks/${book.id}`);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { fixtureAudio: HTMLAudioElement }).fixtureAudio
            .currentTime,
      ),
    )
    .toBeGreaterThanOrEqual(10);
  let reject = true;
  await page.route(`**/api/progress/${book.id}`, async (route) => {
    if (route.request().method() === "PATCH" && reject) {
      await route.fulfill({ status: 503, body: "temporary failure" });
    } else await route.continue();
  });
  const failed = page.waitForResponse(
    (r) => r.url().endsWith(`/api/progress/${book.id}`) && r.status() === 503,
  );
  await page.evaluate(() => {
    const audio = (window as unknown as { fixtureAudio: HTMLAudioElement })
      .fixtureAudio;
    audio.currentTime = 30;
    audio.pause();
  });
  await failed;
  reject = false;
  const accepted = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/progress/${book.id}`) &&
      r.request().method() === "PATCH" &&
      r.ok(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await accepted;
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/progress/${book.id}`)).json())
          .position,
    )
    .toBe(3630);
  const finalSave = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/progress/${book.id}`) &&
      r.request().method() === "PATCH" &&
      r.ok(),
  );
  await page.evaluate(() => {
    (
      window as unknown as { fixtureAudio: HTMLAudioElement }
    ).fixtureAudio.currentTime = 45;
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
  });
  await finalSave;
  await page.reload();
  expect(
    (await (await page.request.get(`/api/progress/${book.id}`)).json())
      .position,
  ).toBe(3645);
});
