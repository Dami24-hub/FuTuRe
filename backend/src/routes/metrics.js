import express from 'express';
import { getSnapshot, resetMetrics } from '../monitoring/metrics.js';
import { checkShardHealth, getShardStats } from '../db/sharding.js';

const router = express.Router();

// GET /api/metrics — full performance snapshot
router.get('/', (_req, res) => {
  res.json(getSnapshot());
});

// DELETE /api/metrics — reset collected metrics
router.delete('/', (_req, res) => {
  resetMetrics();
  res.json({ message: 'Metrics reset' });
});

// GET /api/metrics/shards — shard pool stats
router.get('/shards', (_req, res) => {
  res.json(getShardStats());
});

// GET /api/metrics/shards/health — shard health checks
router.get('/shards/health', async (_req, res) => {
  const health = await checkShardHealth();
  const allOk = health.every(h => h.status === 'ok');
  res.status(allOk ? 200 : 503).json(health);
});

export default router;
