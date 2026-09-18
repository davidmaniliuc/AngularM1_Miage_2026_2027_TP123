import { test, expect } from "bun:test";
import { request, authHeaders } from "./helpers";

test("GET /api/health répond sans authentification ni MongoDB", async () => {
  const response = await request("/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("une route inconnue répond 404 en JSON", async () => {
  const response = await request("/api/inexistant");

  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ message: "Ressource inconnue" });
});

test("CORS autorise le frontend Angular", async () => {
  const response = await request("/api/health", {
    headers: { Origin: "http://localhost:4200" },
  });

  expect(response.headers.get("access-control-allow-origin")).toBe("*");
});
