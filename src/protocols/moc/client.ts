import type { PublicClient } from 'viem';
import {
  MOC_STATE_ABI,
  MOC_STATE_ADDRESS_MAINNET,
  MOC_STATE_ADDRESS_TESTNET,
} from './abi.js';
import type { SupportedNetwork } from '../../config/chains.js';

const PRECISION = 10n ** 18n;

export interface MoCProtocolData {
  bitcoinPriceUsd: string;
  bitcoinMovingAverageUsd: string;
  globalCoverage: string;
  bproTecPrice: string;
  bproUsdPrice: string;
  docTecPrice: string;
  liquidationPrice: string;
  bucketNbtc: string;
  bucketNdoc: string;
  fetchedAt: number;
}

export class MoCClient {
  private readonly client: PublicClient;
  private readonly stateAddress: `0x${string}`;

  constructor(client: PublicClient, network: SupportedNetwork) {
    this.client = client;
    this.stateAddress =
      network === 'mainnet'
        ? MOC_STATE_ADDRESS_MAINNET
        : MOC_STATE_ADDRESS_TESTNET;
  }

  private formatPrecision(raw: bigint): string {
    const whole = raw / PRECISION;
    const frac = raw % PRECISION;
    return `${whole.toString()}.${frac.toString().padStart(18, '0').slice(0, 6)}`;
  }

  async getProtocolData(): Promise<MoCProtocolData> {
    const [
      bitcoinPrice,
      bitcoinMovingAverage,
      coverage,
      bproTecPrice,
      bproUsdPrice,
      docTecPrice,
      liquidationPrice,
      bucketNbtc,
      bucketNdoc,
    ] = await Promise.all([
      this.client.readContract({
        address: this.stateAddress,
        abi: MOC_STATE_ABI,
        functionName: 'getBitcoinPrice',
      }),
      this.client.readContract({
        address: this.stateAddress,
        abi: MOC_STATE_ABI,
        functionName: 'getBitcoinMovingAverage',
      }),
      this.client.readContract({
        address: this.stateAddress,
        abi: MOC_STATE_ABI,
        functionName: 'globalCoverage',
      }),
      this.client.readContract({
        address: this.stateAddress,
        abi: MOC_STATE_ABI,
        functionName: 'bproTecPrice',
      }),
      this.client.readContract({
        address: this.stateAddress,
        abi: MOC_STATE_ABI,
        functionName: 'bproUsdPrice',
      }),
      this.client.readContract({
        address: this.stateAddress,
        abi: MOC_STATE_ABI,
        functionName: 'docTecPrice',
      }),
      this.client.readContract({
        address: this.stateAddress,
        abi: MOC_STATE_ABI,
        functionName: 'getLiquidationPrice',
      }),
      this.client.readContract({
        address: this.stateAddress,
        abi: MOC_STATE_ABI,
        functionName: 'getBucketNBTC',
      }),
      this.client.readContract({
        address: this.stateAddress,
        abi: MOC_STATE_ABI,
        functionName: 'getBucketNDoc',
      }),
    ]);

    return {
      bitcoinPriceUsd: this.formatPrecision(bitcoinPrice),
      bitcoinMovingAverageUsd: this.formatPrecision(bitcoinMovingAverage),
      globalCoverage: this.formatPrecision(coverage),
      bproTecPrice: this.formatPrecision(bproTecPrice),
      bproUsdPrice: this.formatPrecision(bproUsdPrice),
      docTecPrice: this.formatPrecision(docTecPrice),
      liquidationPrice: this.formatPrecision(liquidationPrice),
      bucketNbtc: this.formatPrecision(bucketNbtc),
      bucketNdoc: this.formatPrecision(bucketNdoc),
      fetchedAt: Date.now(),
    };
  }

  async getBitcoinPrice(): Promise<bigint> {
    return this.client.readContract({
      address: this.stateAddress,
      abi: MOC_STATE_ABI,
      functionName: 'getBitcoinPrice',
    });
  }
}
