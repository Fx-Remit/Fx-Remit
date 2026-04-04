export const GATEWAY_ABI = [
  {
    "type": "function",
    "name": "createOrder",
    "inputs": [
      { "name": "token", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" },
      { "name": "rate", "type": "uint256", "internalType": "uint256" },
      { "name": "partner", "type": "address", "internalType": "address" },
      { "name": "partnerPercent", "type": "uint256", "internalType": "uint256" },
      { "name": "refundAddress", "type": "address", "internalType": "address" },
      { "name": "messageHash", "type": "string", "internalType": "string" }
    ],
    "outputs": [{ "name": "orderId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  }
] as const;
