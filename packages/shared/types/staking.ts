import type { IToken } from './token';

export type IServerEvmTransaction = {
  data: string;
  value: string;
  to: string;
};

export type ILidoEthRequest = {
  id: number;
  amountOfStETH: string;
  isFinalized: boolean;
  isClaimed: boolean;
};

export type ILidoTokenItem = {
  price: string;
  balanceParsed: string;
  info: IToken;
};

export type ILidoEthOverview = {
  requests: ILidoEthRequest[];
  eth: ILidoTokenItem;
  stETH: ILidoTokenItem;
  minWithdrawAmount: string;
};

export type ILidoMaticRequest = {
  id: number;
  claimable: boolean;
  amount: string;
};

export type ILidoMaticOverview = {
  matic: ILidoTokenItem;
  stMatic: ILidoTokenItem;
  matic2StMatic: string;
  requests: ILidoMaticRequest[];
};

export type IAllowanceOverview = {
  allowance: string;
  allowanceParsed: string;
};

export type IAprItem = {
  protocol: string;
  apr: number;
  logoUrl: string;
  displayName: string;
};

export type IAprToken = 'eth' | 'matic';

export type IStakeTag = 'lido-eth' | 'lido-matic';

export type IStakingInfo = {
  protocol: string;
  tags: IStakeTag[]; // used for filtering
  send?: { amount: string; token: IToken };
  receive?: { amount: string; token: IToken };
};