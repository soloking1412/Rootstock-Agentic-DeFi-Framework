import {
  type PublicClient,
  type Abi,
  encodeFunctionData,
  BaseError,
  ContractFunctionRevertedError,
  formatUnits,
} from 'viem';

export interface SimulationParams {
  to: `0x${string}`;
  from: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface SwapSimulationParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  slippageBps: number;
  from: `0x${string}`;
}

export interface SimulationResult {
  success: boolean;
  gasEstimate: string;
  returnData: string | null;
  revertReason?: string;
  simulatedAt: number;
}

export interface SwapSimulationResult {
  success: boolean;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  estimatedAmountOut: string;
  priceImpactBps: string;
  gasEstimate: string;
  revertReason?: string;
}

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const satisfies Abi;

export class SimulationEngine {
  private readonly client: PublicClient;

  constructor(client: PublicClient) {
    this.client = client;
  }

  async simulate(params: SimulationParams): Promise<SimulationResult> {
    const now = Date.now();
    try {
      const calldata = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args ?? [],
      });

      const [gasEstimate, callResult] = await Promise.all([
        this.client.estimateGas({
          account: params.from,
          to: params.to,
          data: calldata,
          value: params.value,
        }),
        this.client.call({
          account: params.from,
          to: params.to,
          data: calldata,
          value: params.value,
        }),
      ]);

      return {
        success: true,
        gasEstimate: gasEstimate.toString(),
        returnData: callResult.data ?? null,
        simulatedAt: now,
      };
    } catch (err) {
      let revertReason = 'Unknown revert';
      if (err instanceof BaseError) {
        const revertError = err.walk(
          (e) => e instanceof ContractFunctionRevertedError
        );
        if (revertError instanceof ContractFunctionRevertedError) {
          revertReason = revertError.reason ?? revertError.shortMessage;
        } else {
          revertReason = err.shortMessage;
        }
      }
      return {
        success: false,
        gasEstimate: '0',
        returnData: null,
        revertReason,
        simulatedAt: now,
      };
    }
  }

  async simulateSwap(params: SwapSimulationParams): Promise<SwapSimulationResult> {
    try {
      const [tokenInBalance, tokenInSymbol, tokenInDecimals, tokenOutSymbol] =
        await Promise.all([
          this.client.readContract({
            address: params.tokenIn,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [params.from],
          }),
          this.client.readContract({
            address: params.tokenIn,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }),
          this.client.readContract({
            address: params.tokenIn,
            abi: ERC20_ABI,
            functionName: 'decimals',
          }),
          this.client.readContract({
            address: params.tokenOut,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }),
        ]);

      if (tokenInBalance < params.amountIn) {
        return {
          success: false,
          tokenIn: tokenInSymbol,
          tokenOut: tokenOutSymbol,
          amountIn: formatUnits(params.amountIn, tokenInDecimals),
          estimatedAmountOut: '0',
          priceImpactBps: '0',
          gasEstimate: '0',
          revertReason: `Insufficient balance: have ${formatUnits(tokenInBalance, tokenInDecimals)}, need ${formatUnits(params.amountIn, tokenInDecimals)}`,
        };
      }

      // Slippage-adjusted output estimate (production: replace with on-chain DEX quote)
      const slippageFactor =
        (10000n - BigInt(params.slippageBps)) * params.amountIn;
      const estimatedOut = slippageFactor / 10000n;

      const gasEstimate = await this.client.estimateGas({
        account: params.from,
        to: params.tokenIn,
        data: '0x',
      });

      return {
        success: true,
        tokenIn: tokenInSymbol,
        tokenOut: tokenOutSymbol,
        amountIn: formatUnits(params.amountIn, tokenInDecimals),
        estimatedAmountOut: estimatedOut.toString(),
        priceImpactBps: params.slippageBps.toString(),
        gasEstimate: gasEstimate.toString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn.toString(),
        estimatedAmountOut: '0',
        priceImpactBps: '0',
        gasEstimate: '0',
        revertReason: message,
      };
    }
  }
}
