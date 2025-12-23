pragma solidity ^0.8.26;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract Piggycell is 
    Initializable, 
    ERC20Upgradeable, 
    OwnableUpgradeable, 
    UUPSUpgradeable 
{
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18;
    
    constructor() {
        _disableInitializers();
    }
    
    function initialize(address _owner) public initializer {
        require(_owner != address(0), "Owner cannot be zero address");
        
        __ERC20_init("Piggycell", "PIGGY");
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        
        _mint(_owner, MAX_SUPPLY);
    }
    
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyOwner 
    {
        require(newImplementation != address(0), "New implementation cannot be zero address");
        require(newImplementation.code.length > 0, "New implementation must be a contract");
    }

    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        require(newOwner.code.length > 0, "New owner must be a contract");
        super.transferOwnership(newOwner);
    }
} 
