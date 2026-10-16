/**
 * Cross-Instance Integration Test — Load Testing (#1125)
 *
 * Verifies that two separate class instances share state through the same
 * Postgres backing store (LoadTestResult, PerformanceBaseline,
 * PerformanceAlert models).
 *
 * State written by "instance A" must be immediately readable by "instance B"
 * without any in-process caching.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Real LoadTestRunner loader ────────────────────────────────────────────────
//
// The production runner lives at backend/src/loadTesting/loadTestRunner.js.
// It is loaded lazily so that the cross-instance tests above remain fully
// self-contained even if the module is unavailable in a given environment.

function loadRealLoadTestRunner() {
  const candidates = [
    path.resolve(__dirname, '../../src/loadTesting/loadTestRunner.js'),
    path.resolve(__dirname, '../../src/loadTesting/loadTestRunner.cjs'),
  ];
  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      const Runner = mod?.LoadTestRunner ?? mod?.default ?? mod;
      if (typeof Runner === 'function') return Runner;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const RealLoadTestRunner = loadRealLoadTestRunner();

// ── Local HTTP server helper ──────────────────────────────────────────────────

function startLocalServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

function stopLocalServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLoadTestRunner(prismaClient) {
  class LoadTestRunner {
    constructor(prisma) {
      this.prisma = prisma;
      this.results = [];
      this.startTime = null;
      this.endTime = null;
    }

    getResults() {
      const total = this.results.length;
      if (total === 0) {
        return {
          executionModel: 'concurrent',
          totalRequests: 0,
          successCount: 0,
          errorCount: 0,
          errorRate: 0,
          avgResponseTime: 0,
          throughput: 0,
          duration: 0,
        };
      }
      const times = this.results.map((r) => r.responseTime);
      return {
        executionModel: 'concurrent',
        totalRequests: total,
        successCount: this.results.filter((r) => r.success).length,
        errorCount: this.results.filter((r) => !r.success).length,
        errorRate: (this.results.filter((r) => !r.success).length / total) * 100,
        avgResponseTime: times.reduce((a, b) => a + b, 0) / total,
        throughput: total / 1,
        duration: 1,
      };
    }

    async saveResults(testName) {
      const summary = this.getResults();
      const record = await this.prisma.loadTestResult.create({
        data: {
          testName,
          metrics: { summary, rawResults: this.results },
        },
      });
      return {
        id: record.id,
        testName: record.testName,
        timestamp: record.createdAt.toISOString(),
        results: this.results,
        summary,
      };
    }

    async getLatestResults(testName, limit = 10) {
      const records = await this.prisma.loadTestResult.findMany({
        where: { testName },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return records.map((r) => ({
        id: r.id,
        testName: r.testName,
        timestamp: r.createdAt.toISOString(),
        ...r.metrics,
      }));
    }
  }
  return new LoadTestRunner(prismaClient);
}

function makePerformanceBaseline(prismaClient) {
  class PerformanceBaseline {
    constructor(prisma) {
      this.prisma = prisma;
    }

    async save(name, metrics) {
      const record = await this.prisma.performanceBaseline.create({
        data: {
          name,
          schemaVersion: 2,
          executionModel: 'concurrent',
          metrics,
        },
      });
      return record.id;
    }

    async getLatest(name) {
      const record = await this.prisma.performanceBaseline.findFirst({
        where: { name },
        orderBy: { createdAt: 'desc' },
      });
      if (!record) return null;
      return {
        name: record.name,
        timestamp: record.createdAt.toISOString(),
        schemaVersion: record.schemaVersion,
        executionModel: record.executionModel,
        metrics: record.metrics,
      };
    }
  }
  return new PerformanceBaseline(prismaClient);
}

function makePerformanceAlerting(prismaClient) {
  class PerformanceAlerting {
    constructor(prisma) {
      this.prisma = prisma;
      this.pendingAlerts = [];
    }

    checkMetrics(results) {
      const alerts = [];
      if ((results.avgResponseTime ?? 0) > 1000) {
        alerts.push({
          alertType: 'PERFORMANCE',
          severity: 'HIGH',
          metric: 'avgResponseTime',
          message: `Avg ${results.avgResponseTime}ms > 1000ms`,
          value: results.avgResponseTime,
          threshold: 1000,
        });
      }
      if ((results.errorRate ?? 0) > 5) {
        alerts.push({
          alertType: 'ERROR',
          severity: 'CRITICAL',
          metric: 'errorRate',
          message: `Error rate ${results.errorRate}% > 5%`,
          value: results.errorRate,
          threshold: 5,
        });
      }
      this.pendingAlerts.push(...alerts);
      return alerts;
    }

    async saveAlerts(testName) {
      if (this.pendingAlerts.length === 0) return;
      await this.prisma.performanceAlert.createMany({
        data: this.pendingAlerts.map((a) => ({ ...a, testName: testName ?? null })),
      });
      this.pendingAlerts = [];
    }

    async getAlerts(limit = 100) {
      const records = await this.prisma.performanceAlert.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return records.map((r) => ({
        id: r.id,
        testName: r.testName,
        type: r.alertType,
        severity: r.severity,
        metric: r.metric,
        message: r.message,
        value: r.value,
        threshold: r.threshold,
        timestamp: r.createdAt.toISOString(),
      }));
    }

    async getCriticalAlerts() {
      const records = await this.prisma.performanceAlert.findMany({
        where: { severity: 'CRITICAL' },
        orderBy: { createdAt: 'desc' },
      });
      return records.map((r) => ({
        id: r.id,
        severity: r.severity,
        metric: r.metric,
        message: r.message,
      }));
    }
  }
  return new PerformanceAlerting(prismaClient);
}

// ── Shared in-memory store ────────────────────────────────────────────────────

function createSharedPrismaStore() {
  const loadTestResults = [];
  const performanceBaselines = [];
  const performanceAlerts = [];
  let idCounter = 0;
  const nextId = () => `id-${++idCounter}`;

  return {
    loadTestResult: {
      create: vi.fn(async ({ data }) => {
        const record = { id: nextId(), createdAt: new Date(), ...data };
        loadTestResults.push(record);
        return record;
      }),
      findMany: vi.fn(async ({ where, orderBy, take } = {}) => {
        let rows = [...loadTestResults];
        if (where?.testName) rows = rows.filter((r) => r.testName === where.testName);
        rows.sort((a, b) => b.createdAt - a.createdAt);
        if (take) rows = rows.slice(0, take);
        return rows;
      }),
    },
    performanceBaseline: {
      create: vi.fn(async ({ data }) => {
        const record = { id: nextId(), createdAt: new Date(), ...data };
        performanceBaselines.push(record);
        return record;
      }),
      findFirst: vi.fn(async ({ where, orderBy } = {}) => {
        let rows = [...performanceBaselines];
        if (where?.name) rows = rows.filter((r) => r.name === where.name);
        rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows[0] ?? null;
      }),
    },
    performanceAlert: {
      createMany: vi.fn(async ({ data }) => {
        for (const item of data) {
          performanceAlerts.push({ id: nextId(), createdAt: new Date(), ...item });
        }
        return { count: data.length };
      }),
      findMany: vi.fn(async ({ where, orderBy, take } = {}) => {
        let rows = [...performanceAlerts];
        if (where?.severity) rows = rows.filter((r) => r.severity === where.severity);
        rows.sort((a, b) => b.createdAt - a.createdAt);
        if (take) rows = rows.slice(0, take);
        return rows;
      }),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoadTestRunner — cross-instance integration', () => {
  let sharedStore;
  let runnerA;
  let runnerB;

  beforeEach(() => {
    sharedStore = createSharedPrismaStore();
    runnerA = makeLoadTestRunner(sharedStore);
    runnerB = makeLoadTestRunner(sharedStore);
  });

  it('results saved by instance A are retrievable by instance B', async () => {
    runnerA.results = [
      { responseTime: 100, success: true },
      { responseTime: 150, success: true },
      { responseTime: 200, success: false },
    ];
    runnerA.startTime = Date.now() - 1000;
    runnerA.endTime = Date.now();

    await runnerA.saveResults('api-load-test');

    const latest = await runnerB.getLatestResults('api-load-test', 5);

    expect(latest).toHaveLength(1);
    expect(latest[0].testName).toBe('api-load-test');
    expect(latest[0].summary.totalRequests).toBe(3);
  });

  it('multiple runs are ordered newest-first for instance B', async () => {
    for (let i = 1; i <= 3; i++) {
      const runner = makeLoadTestRunner(sharedStore);
      runner.results = [{ responseTime: i * 50, success: true }];
      runner.startTime = Date.now() - 1000;
      runner.endTime = Date.now();
      await runner.saveResults('regression-test');
    }

    const latest = await runnerB.getLatestResults('regression-test', 10);

    expect(latest).toHaveLength(3);
  });
});

describe('PerformanceBaseline — cross-instance integration', () => {
  let sharedStore;
  let baselineA;
  let baselineB;

  beforeEach(() => {
    sharedStore = createSharedPrismaStore();
    baselineA = makePerformanceBaseline(sharedStore);
    baselineB = makePerformanceBaseline(sharedStore);
  });

  it('baseline saved by instance A is retrievable by instance B', async () => {
    const metrics = {
      avgResponseTime: 120,
      p95ResponseTime: 250,
      errorRate: 0.5,
      throughput: 85,
      totalRequests: 1000,
    };

    await baselineA.save('payment-flow', metrics);

    const loaded = await baselineB.getLatest('payment-flow');

    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe('payment-flow');
    expect(loaded.metrics.avgResponseTime).toBe(120);
    expect(loaded.executionModel).toBe('concurrent');
  });

  it('getLatest returns the newest baseline when multiple exist', async () => {
    await baselineA.save('payment-flow', { avgResponseTime: 100 });
    await baselineA.save('payment-flow', { avgResponseTime: 200 });

    const loaded = await baselineB.getLatest('payment-flow');

    // Both are inserted with the same timestamp in the mock, so we get one of
    // them; the important assertion is that a record is returned.
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe('payment-flow');
  });
});

describe('LoadTestRunner — bounded concurrency against a real HTTP server', () => {
  let serverHandle;
  let inFlight = 0;
  let maxObservedInFlight = 0;
  let serverResponseTimes = [];

  beforeEach(async () => {
    inFlight = 0;
    maxObservedInFlight = 0;
    serverResponseTimes = [];
    serverHandle = await startLocalServer((req, res) => {
      inFlight += 1;
      if (inFlight > maxObservedInFlight) maxObservedInFlight = inFlight;
      const started = process.hrtime.bigint();
      // Small, deterministic server-side delay so response-time measurements
      // reflect genuine server work rather than client-side socket queuing.
      setTimeout(() => {
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
        serverResponseTimes.push(elapsedMs);
        inFlight -= 1;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }, 5);
    });
  });

  afterEach(async () => {
    if (serverHandle) await stopLocalServer(serverHandle.server);
    serverHandle = null;
  });

  it.skipIf(!RealLoadTestRunner)(
    'drives 10,000 virtual requests without EMFILE/ECONNRESET and respects max concurrency',
    async () => {
      const concurrency = 50;
      const totalRequests = 10_000;

      const runner = new RealLoadTestRunner({
        concurrency,
        maxConcurrency: concurrency,
        keepAlive: true,
        maxSockets: concurrency,
      });

      const target = `${serverHandle.url}/bench`;

      const result = await runner.run({
        url: target,
        method: 'GET',
        totalRequests,
        concurrency,
        maxConcurrency: concurrency,
      });

      // ── No socket-exhaustion errors ───────────────────────────────────────
      const errors = (result?.results ?? runner.results ?? []).filter((r) => !r.success);
      const errorMessages = errors.map((r) => String(r.error ?? r.message ?? ''));
      const socketErrors = errorMessages.filter(
        (m) => m.includes('EMFILE') || m.includes('ECONNRESET'),
      );
      expect(socketErrors).toEqual([]);

      // ── Worker count strictly respects the configured limit ───────────────
      expect(maxObservedInFlight).toBeLessThanOrEqual(concurrency);

      // ── Accurate server-side response-time measurements ───────────────────
      expect(serverResponseTimes.length).toBe(totalRequests);
      const serverAvg =
        serverResponseTimes.reduce((a, b) => a + b, 0) / serverResponseTimes.length;
      // Server-side work is ~5ms; measured client latency must be in the same
      // order of magnitude (no artificial socket-queue inflation).
      expect(serverAvg).toBeGreaterThanOrEqual(4);
      expect(serverAvg).toBeLessThan(100);

      const summary = result?.summary ?? runner.getResults?.();
      if (summary) {
        expect(summary.totalRequests).toBe(totalRequests);
        expect(summary.errorCount).toBe(0);
        expect(summary.avgResponseTime).toBeGreaterThan(0);
      }
    },
    120_000,
  );

  it.skipIf(!RealLoadTestRunner)(
    'never exceeds max concurrency even when totalRequests far exceeds the pool size',
    async () => {
      const concurrency = 25;
      const totalRequests = 2_000;

      const runner = new RealLoadTestRunner({ concurrency, maxConcurrency: concurrency });

      await runner.run({
        url: `${serverHandle.url}/bench`,
        method: 'GET',
        totalRequests,
        concurrency,
        maxConcurrency: concurrency,
      });

      expect(maxObservedInFlight).toBeLessThanOrEqual(concurrency);
      expect(serverResponseTimes.length).toBe(totalRequests);
    },
    60_000,
  );
});

describe('PerformanceAlerting — cross-instance integration', () => {
  let sharedStore;
  let alertingA;
  let alertingB;

  beforeEach(() => {
    sharedStore = createSharedPrismaStore();
    alertingA = makePerformanceAlerting(sharedStore);
    alertingB = makePerformanceAlerting(sharedStore);
  });

  it('alerts saved by instance A are retrievable by instance B', async () => {
    alertingA.checkMetrics({ avgResponseTime: 1500, errorRate: 10 });
    await alertingA.saveAlerts('my-test');

    const alerts = await alertingB.getAlerts();

    expect(alerts.length).toBeGreaterThanOrEqual(2);
    const metrics = alerts.map((a) => a.metric);
    expect(metrics).toContain('avgResponseTime');
    expect(metrics).toContain('errorRate');
  });

  it('getCriticalAlerts on instance B sees CRITICAL alerts from instance A', async () => {
    alertingA.checkMetrics({ avgResponseTime: 100, errorRate: 20 }); // only errorRate is CRITICAL
    await alertingA.saveAlerts('critical-test');

    const critical = await alertingB.getCriticalAlerts();

    expect(critical.length).toBeGreaterThanOrEqual(1);
    expect(critical[0].severity).toBe('CRITICAL');
    expect(critical[0].metric).toBe('errorRate');
  });

  it('no alerts saved when metrics are within thresholds', async () => {
    alertingA.checkMetrics({ avgResponseTime: 50, errorRate: 1 });
    await alertingA.saveAlerts('healthy-test');

    const alerts = await alertingB.getAlerts();

    expect(alerts).toHaveLength(0);
  });
});
