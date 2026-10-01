import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { randomUUID } from "node:crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    if (req.originalUrl.length > 8192) {
      res.status(414).json({ error: "Request target too long" });
      return;
    }
    next();
  });

  const requestCounts = new Map<string, { startedAt: number; count: number }>();
  app.use((req, res, next) => {
    const requestId = req.header("x-request-id")?.slice(0, 96) || randomUUID();
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' https://analytics.manus.im; connect-src 'self' https:");
    }
    next();
  });

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "64kb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/api/trpc", (req, res, next) => {
    const now = Date.now();
    const key = (req.header("x-forwarded-for") || req.ip || "unknown").split(",")[0].trim();
    const previous = requestCounts.get(key);
    const current = !previous || now - previous.startedAt >= 60_000
      ? { startedAt: now, count: 1 }
      : { startedAt: previous.startedAt, count: previous.count + 1 };
    requestCounts.set(key, current);
    if (current.count > 120) {
      res.status(429).json({ error: "Too many requests", requestId: res.getHeader("X-Request-ID") });
      return;
    }
    next();
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
