import type { PublicClient } from 'viem';
import { formatUnits } from 'viem';
import {
  COMPTROLLER_ABI,
  CTOKEN_ABI,
  TROPYKUS_COMPTROLLER_ADDRESS,
  TROPYKUS_MARKETS,
  BLOCKS_PER_YEAR,
} from './abi.js';

const MANTISSA = 10n ** 18n;

export interface MarketData {
  symbol: string;
  address: string;
  supplyApyPercent: string;
  borrowApyPercent: string;
  totalSupply: string;
  totalBorrows: string;
  availableLiquidity: string;
  collateralFactorPercent: string;
}

export interface AccountPosition {
  marketAddress: string;
  symbol: string;
  supplyBalance: string;
  borrowBalance: string;
}

export interface PositionHealth {
  liquidity: string;
  shortfall: string;
  healthFactor: string;
  isHealthy: boolean;
  positions: AccountPosition[];
}

export class TropykusClient {
  private readonly client: PublicClient;
  private readonly comptrollerAddress: `0x${string}`;

  constructor(client: PublicClient) {
    this.client = client;
    this.comptrollerAddress = TROPYKUS_COMPTROLLER_ADDRESS;
  }

  private ratePerBlockToApy(ratePerBlock: bigint): string {
    const rate = parseFloat(formatUnits(ratePerBlock, 18));
    const apy = (Math.pow(rate + 1, Number(BLOCKS_PER_YEAR)) - 1) * 100;
    return apy.toFixed(4);
  }

  private formatUnits(value: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = value / divisor;
    const frac = value % divisor;
    return `${whole.toString()}.${frac.toString().padStart(decimals, '0').slice(0, 6)}`;
  }

  async getAllMarkets(): Promise<MarketData[]> {
    const marketAddresses = Object.values(TROPYKUS_MARKETS) as `0x${string}`[];
    const settled = await Promise.allSettled(
      marketAddresses.map((addr) => this.getMarketData(addr))
    );
    return settled
      .filter(
        (r): r is PromiseFulfilledResult<MarketData> =>
          r.status === 'fulfilled'
      )
      .map((r) => r.value);
  }

  async getMarketData(address: `0x${string}`): Promise<MarketData> {
    const [
      supplyRate,
      borrowRate,
      totalSupply,
      totalBorrows,
      cash,
      symbol,
      decimals,
      marketInfo,
    ] = await Promise.all([
      this.client.readContract({
        address,
        abi: CTOKEN_ABI,
        functionName: 'supplyRatePerBlock',
      }),
      this.client.readContract({
        address,
        abi: CTOKEN_ABI,
        functionName: 'borrowRatePerBlock',
      }),
      this.client.readContract({
        address,
        abi: CTOKEN_ABI,
        functionName: 'totalSupply',
      }),
      this.client.readContract({
        address,
        abi: CTOKEN_ABI,
        functionName: 'totalBorrows',
      }),
      this.client.readContract({
        address,
        abi: CTOKEN_ABI,
        functionName: 'getCash',
      }),
      this.client.readContract({
        address,
        abi: CTOKEN_ABI,
        functionName: 'symbol',
      }),
      this.client.readContract({
        address,
        abi: CTOKEN_ABI,
        functionName: 'decimals',
      }),
      this.client.readContract({
        address: this.comptrollerAddress,
        abi: COMPTROLLER_ABI,
        functionName: 'markets',
        args: [address],
      }),
    ]);

    return {
      symbol,
      address,
      supplyApyPercent: this.ratePerBlockToApy(supplyRate),
      borrowApyPercent: this.ratePerBlockToApy(borrowRate),
      totalSupply: this.formatUnits(totalSupply, decimals),
      totalBorrows: this.formatUnits(totalBorrows, decimals),
      availableLiquidity: this.formatUnits(cash, decimals),
      collateralFactorPercent: this.formatUnits(
        marketInfo[1], // collateralFactorMantissa
        16
      ),
    };
  }

  async getPositionHealth(account: `0x${string}`): Promise<PositionHealth> {
    const [accountLiquidity, assetsIn] = await Promise.all([
      this.client.readContract({
        address: this.comptrollerAddress,
        abi: COMPTROLLER_ABI,
        functionName: 'getAccountLiquidity',
        args: [account],
      }),
      this.client.readContract({
        address: this.comptrollerAddress,
        abi: COMPTROLLER_ABI,
        functionName: 'getAssetsIn',
        args: [account],
      }),
    ]);

    const [, liquidity, shortfall] = accountLiquidity;

    let healthFactor: string;
    if (shortfall > 0n) {
      const hf = Number((liquidity * 10000n) / shortfall) / 10000;
      healthFactor = hf.toFixed(4);
    } else if (liquidity > 0n) {
      healthFactor = 'healthy';
    } else {
      healthFactor = 'no_position';
    }

    const positions = await Promise.all(
      assetsIn.map(async (marketAddress) => {
        const [supplyBalance, borrowBalance, symbol] = await Promise.all([
          this.client.readContract({
            address: marketAddress,
            abi: CTOKEN_ABI,
            functionName: 'balanceOf',
            args: [account],
          }),
          this.client.readContract({
            address: marketAddress,
            abi: CTOKEN_ABI,
            functionName: 'borrowBalanceCurrent',
            args: [account],
          }),
          this.client.readContract({
            address: marketAddress,
            abi: CTOKEN_ABI,
            functionName: 'symbol',
          }),
        ]);
        return {
          marketAddress,
          symbol,
          supplyBalance: supplyBalance.toString(),
          borrowBalance: borrowBalance.toString(),
        };
      })
    );

    return {
      liquidity: liquidity.toString(),
      shortfall: shortfall.toString(),
      healthFactor,
      isHealthy: shortfall === 0n,
      positions,
    };
  }
}
