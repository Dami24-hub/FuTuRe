import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';
import stellarRoutes from './routes/stellar.js';
import eventsRoutes from './routes/events.js';
import securityRoutes from './routes/security.js';
import { eventMonitor } from './eventSourcing/index.js';
import { auditLogger } from './security/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize event sourcing
await eventMonitor.initialize();
await auditLogger.initialize();

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/stellar', stellarRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/security', securityRoutes);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the status of the server and the connected Stellar network.
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 network:
 *                   type: string
 *                   example: testnet
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', network: process.env.STELLAR_NETWORK });
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Network: ${process.env.STELLAR_NETWORK}`);
});
