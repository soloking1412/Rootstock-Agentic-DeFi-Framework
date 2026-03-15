import { publicClient, config } from '../config/index.js';
import { MoCClient } from './moc/client.js';
import { TropykusClient } from './tropykus/client.js';
import { SimulationEngine } from '../simulation/engine.js';

export const mocClient = new MoCClient(publicClient, config.network);
export const tropykusClient = new TropykusClient(publicClient);
export const simulationEngine = new SimulationEngine(publicClient);
