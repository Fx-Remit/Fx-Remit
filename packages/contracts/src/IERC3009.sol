// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev EIP-3009 subset implemented by Circle's USDC (FiatToken v2+) and Tether's USDT on Celo.
 * Its own file so PayoutForwarderV2's bytecode (and so its CREATE2 address) doesn't change when
 * PayoutForwarder.sol or FXRemitConstants.sol are edited. V1 keeps its own copy so its source
 * stays identical to the deployed contract.
 */
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
