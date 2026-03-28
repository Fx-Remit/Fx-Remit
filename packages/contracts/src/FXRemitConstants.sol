// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FXRemitConstants
 * @dev Registry of protocol-owned and third-party contract addresses for the initial launch chains.
 */
library FXRemitConstants {
    // --- Global ---
    address public constant PERMIT2 =
        0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // --- Base Mainnet (8453) ---
    address public constant BASE_GATEWAY =
        0x30F6A8457F8E42371E204a9c103f2Bd42341dD0F;
    address public constant BASE_UNISWAP_V3_ROUTER =
        0x2626664c2603336E57B271c5C0b26F421741e481;
    address public constant BASE_WETH =
        0x4200000000000000000000000000000000000006;
    address public constant BASE_USDC =
        0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // --- Arbitrum One (42161) ---
    address public constant ARB_GATEWAY =
        0xE8bc3B607CfE68F47000E3d200310D49041148Fc;
    address public constant ARB_UNISWAP_V3_ROUTER =
        0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address public constant ARB_WETH =
        0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address public constant ARB_USDC =
        0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    // --- Celo Mainnet (42220) ---
    address public constant CELO_GATEWAY =
        0xF418217E3f81092eF44b81C5C8336e6A6fDB0E4b;
    address public constant CELO_MENTO_BROKER =
        0x777A8255cA72412f0d706dc03C9D1987306B4CaD;
    address public constant CELO_CELO_TOKEN =
        0x471EcE3750Da237f93B8E339c536989b8978a438;
    address public constant CELO_CUSD =
        0x765DE816845861e75A25fCA122bb6898B8B1282a;
    address public constant CELO_MENTO_EXCHANGE_ID =
        0x471EcE3750Da237f93B8E339c536989b8978a438;
}
