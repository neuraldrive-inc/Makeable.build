import { expect, test } from "@playwright/test";

const apiOrigin = "https://api.makeable.test";
const tokenPayload = Buffer.from(
  JSON.stringify({ sub: "maker-123", email: "maker@example.com" }),
).toString("base64url");
const accessToken = `header.${tokenPayload}.signature`;

test("the Raymond shell sends protected work through the current account API", async ({
  page,
}) => {
  const protectedRequests = [];

  await page.addInitScript(
    ({ token }) => {
      sessionStorage.setItem(
        "makeable.auth.v1",
        JSON.stringify({
          accessToken: token,
          idToken: token,
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 60 * 60 * 1000,
        }),
      );
    },
    { token: accessToken },
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        apiBaseUrl: apiOrigin,
        hasAccounts: true,
        cognitoDomain: "auth.makeable.test",
        cognitoClientId: "makeable-web",
      }),
    }),
  );
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    protectedRequests.push({
      url: request.url(),
      method: request.method(),
      headers: await request.allHeaders(),
    });
    if (new URL(request.url()).pathname === "/api/account") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ credits: 9 }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "resp_test",
        status: "completed",
        output_text: "ok",
      }),
    });
  });

  await page.goto("/build/new");

  await expect(page.locator("#accountName")).toHaveText("maker@example.com");
  await expect(page.locator("#creditBadge")).toHaveText("9 credits");
  await expect(page.locator("#accountButton")).toHaveText("Sign out");
  expect(await page.evaluate(() => window.MAKEABLE_AUTH.projectKey)).toBe(
    "account-maker-123",
  );

  const responseBody = await page.evaluate(async () => {
    const response = await window.MAKEABLE_API_FETCH("/api/openai/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "test" }),
    });
    return response.json();
  });
  expect(responseBody).toMatchObject({ id: "resp_test", status: "completed" });

  const accountRequest = protectedRequests.find(({ url }) =>
    url.endsWith("/api/account"),
  );
  const aiRequest = protectedRequests.find(({ url }) =>
    url.endsWith("/api/openai/background"),
  );
  expect(accountRequest?.headers.authorization).toBe(`Bearer ${accessToken}`);
  expect(aiRequest?.headers.authorization).toBe(`Bearer ${accessToken}`);
  expect(aiRequest?.headers["x-makeable-generation-id"]).toMatch(
    /^[a-zA-Z0-9_-]{8,100}$/,
  );
});

test("a revoked cached token is refreshed before account work continues", async ({ page }) => {
  const replacementToken = `header.${tokenPayload}.replacement`;
  const accountAuthorizations = [];

  await page.addInitScript(
    ({ token }) => {
      sessionStorage.setItem(
        "makeable.auth.v1",
        JSON.stringify({
          accessToken: token,
          idToken: token,
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 60 * 60 * 1000,
        }),
      );
    },
    { token: accessToken },
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        apiBaseUrl: apiOrigin,
        hasAccounts: true,
        cognitoDomain: "auth.makeable.test",
        cognitoClientId: "makeable-web",
      }),
    }),
  );
  await page.route("https://auth.makeable.test/oauth2/token", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ access_token: replacementToken, expires_in: 3600 }),
    }),
  );
  await page.route(`${apiOrigin}/api/account`, async (route) => {
    const authorization = (await route.request().allHeaders()).authorization;
    accountAuthorizations.push(authorization);
    if (authorization === `Bearer ${accessToken}`) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Token revoked" }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ credits: 7 }),
    });
  });

  await page.goto("/build/new");

  await expect(page.locator("#accountName")).toHaveText("maker@example.com");
  await expect(page.locator("#creditBadge")).toHaveText("7 credits");
  expect(accountAuthorizations).toEqual([
    `Bearer ${accessToken}`,
    `Bearer ${replacementToken}`,
  ]);
});
