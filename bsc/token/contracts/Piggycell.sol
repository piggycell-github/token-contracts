// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";

abstract contract BEP20TokenOwner is Ownable {
    constructor() Ownable(_msgSender()) {}

    function getOwner() external view returns (address) {
        return owner();
    }
}

abstract contract ERC20Decimals is ERC20 {
    uint8 private immutable _decimals;

    constructor(uint8 decimals_) {
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}

abstract contract ERC20Detailed is ERC20Decimals {
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) ERC20Decimals(decimals_) {}
}

contract PiggycellToken is ERC20Detailed, BEP20TokenOwner {
    uint256 public constant MAX_SUPPLY = 100000000 * 10**18;

    mapping(address => bool) public authorizedUsers;
    
    event AuthorizedUserAdded(address indexed user);
    event AuthorizedUserRemoved(address indexed user);
    event TokensMinted(address indexed by, address indexed to, uint256 amount);
    event TokensBurned(address indexed by, address indexed from, uint256 amount);
    
    modifier onlyAuthorized() {
        require(authorizedUsers[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    constructor(address initialOwner, uint256 initialSupply)
        ERC20Detailed("Piggycell", "PIGGY", 18)
    {
        require(initialOwner != address(0), "Owner cannot be zero address");
        require(initialSupply > 0, "Initial supply must be greater than zero");
        require(initialSupply <= MAX_SUPPLY, "Initial supply exceeds maximum supply");
        
        _transferOwnership(initialOwner);
        _mint(initialOwner, initialSupply);
    }

    function addAuthorizedUser(address user) external onlyOwner {
        require(user != address(0), "Cannot add zero address");
        require(!authorizedUsers[user], "User already authorized");
        authorizedUsers[user] = true;
        emit AuthorizedUserAdded(user);
    }

    function removeAuthorizedUser(address user) external onlyOwner {
        require(authorizedUsers[user], "User not authorized");
        authorizedUsers[user] = false;
        emit AuthorizedUserRemoved(user);
    }

    function isAuthorized(address user) external view returns (bool) {
        return authorizedUsers[user] || user == owner();
    }

    function mint(address to, uint256 amount) external onlyAuthorized {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than zero");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds maximum supply");
        _mint(to, amount);
        emit TokensMinted(msg.sender, to, amount);
    }

    function burn(uint256 amount) external {
        require(amount > 0, "Amount must be greater than zero");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, msg.sender, amount);
    }
}