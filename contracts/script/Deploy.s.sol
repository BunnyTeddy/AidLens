// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AidLensReliefFund} from "../src/AidLensReliefFund.sol";

interface Vm {
    function envUint(string calldata key) external returns (uint256 value);
    function envAddress(string calldata key) external returns (address value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployAidLens {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (AidLensReliefFund fund) {
        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("AIDLENS_ADMIN_ADDRESS");
        vm.startBroadcast(privateKey);
        fund = new AidLensReliefFund(admin, 12 ether);
        vm.stopBroadcast();
    }
}
