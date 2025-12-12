// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1967Proxy as OZERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// This contract ensures ERC1967Proxy is compiled by Hardhat
// It wraps OpenZeppelin's ERC1967Proxy with the expected name
contract ERC1967Proxy is OZERC1967Proxy {
    constructor(address implementation, bytes memory _data) 
        OZERC1967Proxy(implementation, _data) 
    {}
}

