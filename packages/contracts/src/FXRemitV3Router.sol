pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IFXRemitV3Router.sol";
import "./ISwapAdapter.sol";
import "./IPaycrestGateway.sol";
import "./IPermit2.sol";
import "./IWETH.sol";

/**
 * @title FXRemitV3Router
 * @dev Stateless router for cross-chain stablecoin-to-fiat transfers via Paycrest.
 */
contract FXRemitV3Router is IFXRemitV3Router, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NoAdapterForToken(address token);
    error InsufficientOutput(uint256 output, uint256 minOutput);

    address public gateway;
    IPermit2 public immutable permit2;
    mapping(address => address) public adapters; // fromToken => adapterAddress

    address public feeCollector;
    uint256 public feeBps; // basis points (e.g. 50 = 0.5%)
    address public immutable weth;

    event FeeConfigUpdated(address indexed feeCollector, uint256 feeBps);

    constructor(address _gateway, address _permit2, address _weth) Ownable(msg.sender) {
        gateway = _gateway;
        permit2 = IPermit2(_permit2);
        weth = _weth;
    }

    /**
     * @dev Update the Paycrest Gateway address.
     * @param _gateway The new gateway address.
     */
    function setGateway(address _gateway) external override onlyOwner {
        emit GatewayUpdated(gateway, _gateway);
        gateway = _gateway;
    }

    /**
     * @dev Set or update an adapter for a specific input token.
     * @param fromToken The token to swap from.
     * @param adapter The adapter contract address.
     */
    function setAdapter(address fromToken, address adapter) external onlyOwner {
        adapters[fromToken] = adapter;
    }

    /**
     * @dev Update the fee configuration.
     * @param _feeCollector The address to receive partner fees.
     * @param _feeBps The percentage to charge (in basis points).
     */
    function setFeeConfig(address _feeCollector, uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 200, "Fee too high: max 2%");
        feeCollector = _feeCollector;
        feeBps = _feeBps;
        emit FeeConfigUpdated(_feeCollector, _feeBps);
    }

    /**
     * @dev Rescue accidentally sent tokens.
     * @param token The token to rescue.
     * @param to The recipient of the tokens.
     * @param amount The amount to rescue.
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @dev Variation of swapAndRemit that uses Permit2 for single-signature approval.
     */
    function swapAndRemitWithPermit(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 rate,
        address refundAddress,
        string calldata messageHash,
        string calldata targetCurrency,
        string calldata providerId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        // 1. Handle Permit2 transfer
        permit2.permitTransferFrom(
            IPermit2.PermitTransferFrom({
                permitted: IPermit2.TokenPermissions({token: fromToken, amount: amountIn}),
                nonce: nonce,
                deadline: deadline
            }),
            IPermit2.SignatureTransferDetails({
                to: address(this),
                requestedAmount: amountIn
            }),
            msg.sender,
            signature
        );

        // 2. Execute swap and remit logic (internal)
        _executeRemit(
            fromToken,
            toToken,
            amountIn,
            minAmountOut,
            rate,
            refundAddress,
            messageHash,
            targetCurrency,
            providerId,
            false // funds already pulled
        );
    }

    function swapAndRemit(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 rate,
        address refundAddress,
        string calldata messageHash,
        string calldata targetCurrency,
        string calldata providerId
    ) external override payable nonReentrant {
        _executeRemit(
            fromToken,
            toToken,
            amountIn,
            minAmountOut,
            rate,
            refundAddress,
            messageHash,
            targetCurrency,
            providerId,
            true // pull funds via transferFrom
        );
    }

    function _executeRemit(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 rate,
        address refundAddress,
        string calldata messageHash,
        string calldata targetCurrency,
        string calldata providerId,
        bool pullFunds
    ) internal {
        uint256 amountToRemit;

        if (fromToken == address(0)) {
            require(msg.value == amountIn, "Inconsistent ETH amount");
            IWETH(weth).deposit{value: msg.value}();
            fromToken = weth;
            pullFunds = false;
        } else {
            require(msg.value == 0, "ETH sent with ERC20 remit");
        }

        if (fromToken == toToken) {
            if (pullFunds) {
                IERC20(fromToken).safeTransferFrom(msg.sender, address(this), amountIn);
            }
            amountToRemit = amountIn;
        } else {
            address adapter = adapters[fromToken];
            if (adapter == address(0)) revert NoAdapterForToken(fromToken);

            if (pullFunds) {
                IERC20(fromToken).safeTransferFrom(msg.sender, adapter, amountIn);
            } else {
                IERC20(fromToken).safeTransfer(adapter, amountIn);
            }
            
            amountToRemit = ISwapAdapter(adapter).swap(
                fromToken,
                toToken,
                amountIn,
                minAmountOut,
                address(this)
            );
            
            if (amountToRemit < minAmountOut) revert InsufficientOutput(amountToRemit, minAmountOut);
        }

        // Give gateway allowance
        IERC20(toToken).safeIncreaseAllowance(gateway, amountToRemit);

        // Call Paycrest Gateway
        uint256 orderId = IPaycrestGateway(gateway).createOrder(
            toToken,
            amountToRemit,
            rate,
            feeCollector,
            feeBps,
            refundAddress,
            messageHash
        );

        emit RemittanceInitiated(
            orderId,
            msg.sender,
            fromToken,
            toToken,
            amountIn,
            amountToRemit,
            block.chainid,
            targetCurrency,
            providerId,
            feeCollector,
            feeBps
        );
    }
}
